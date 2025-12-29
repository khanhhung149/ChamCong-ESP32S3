#include <Arduino.h>
#include <eloquent_esp32cam.h>
#include <eloquent_esp32cam/face/detection.h>
#include <TFT_eSPI.h>
#include <WiFi.h>
#include <HTTPClient.h> 
#include <base64.h> 
#include <FS.h>       
#include <SPIFFS.h> 
#include "esp_camera.h"
#include <WebSocketsClient.h> 
#include <Preferences.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <RTClib.h>   
#include <SD_MMC.h>   
#include <time.h>     
#include "img_converters.h"
#include <driver/rtc_io.h>
// --- CẤU HÌNH PIN ---
#define WIFI_RESET_BTN 14
#define SDA_PIN 47
#define SCL_PIN 21

// --- BIẾN TOÀN CỤC ---
Preferences preferences;
char server_ip_buffer[40] = "192.168.137.1"; 
int server_port = 5000;

TFT_eSPI tft = TFT_eSPI();
WebSocketsClient webSocket;
RTC_DS3231 rtc;

// --- FREERTOS HANDLES ---
SemaphoreHandle_t tftMutex;
SemaphoreHandle_t camMutex;

using eloq::camera;
using eloq::face_t;
using eloq::face::detection;

// Trạng thái
volatile bool gEnrollingInProgress = false;
String gEnrollName = "";
unsigned long lastCaptureTime = 0;
#define CAPTURE_INTERVAL 800 

// Motion Liveness
struct FaceLog { int x, y; };
FaceLog lastFace = {0, 0};
#define MOTION_THRESHOLD 5   
#define MAX_MOTION 60        

volatile bool gSystemIsWorking = true;

struct TimeSlot {
    int startHour; int startMin; // Giờ mở máy
    int endHour;   int endMin;   // Giờ tắt máy
};
// Định nghĩa 3 khung giờ hoạt động trong ngày
const int NUM_SLOTS = 3;
TimeSlot activeSlots[NUM_SLOTS] = {
    {7, 0,  8, 15},
    {11, 0, 13, 0},  
    {17, 00, 21, 0}   
};
void saveTimeConfig() {
    preferences.begin("chamcong-config", false);
    preferences.putBytes("slots", activeSlots, sizeof(activeSlots));
    preferences.end();
    Serial.println("💾 [CONFIG] Đã lưu cấu hình giờ mới!");
}

// Hàm tải cấu hình từ Flash
void loadTimeConfig() {
    preferences.begin("chamcong-config", true);
    if (preferences.isKey("slots")) {
        preferences.getBytes("slots", activeSlots, sizeof(activeSlots));
        Serial.println("📂 [CONFIG] Đã tải cấu hình từ bộ nhớ.");
    } else {
        Serial.println("⚠️ [CONFIG] Chưa có cấu hình, dùng mặc định.");
    }
    preferences.end();
}
long calculateSleepSeconds() {
    DateTime now = rtc.now();
    long currentSec = now.hour() * 3600 + now.minute() * 60 + now.second();
    long dayEndSec = 24 * 3600;

    // 1. Kiểm tra xem có đang trong giờ hoạt động không?
    for (int i = 0; i < NUM_SLOTS; i++) {
        long startSec = activeSlots[i].startHour * 3600 + activeSlots[i].startMin * 60;
        long endSec   = activeSlots[i].endHour * 3600 + activeSlots[i].endMin * 60;

        if (currentSec >= startSec && currentSec < endSec) {
            Serial.printf("✅ Đang trong khung giờ hoạt động %d (%02d:%02d - %02d:%02d)\n", 
                          i+1, activeSlots[i].startHour, activeSlots[i].startMin, activeSlots[i].endHour, activeSlots[i].endMin);
            return 0; // KHÔNG NGỦ
        }
    }

    // 2. Nếu không, tìm khung giờ mở tiếp theo
    for (int i = 0; i < NUM_SLOTS; i++) {
        long startSec = activeSlots[i].startHour * 3600 + activeSlots[i].startMin * 60;
        if (startSec > currentSec) {
            long sleepTime = startSec - currentSec;
            Serial.printf("💤 Ngủ đợi đến khung giờ tiếp theo: %02d:%02d (còn %ld giây)\n", 
                          activeSlots[i].startHour, activeSlots[i].startMin, sleepTime);
            return sleepTime;
        }
    }

    // 3. Nếu hết khung hôm nay -> Ngủ tới khung đầu tiên ngày mai
    long firstSlotTomorrow = activeSlots[0].startHour * 3600 + activeSlots[0].startMin * 60;
    long sleepUntilTomorrow = (dayEndSec - currentSec) + firstSlotTomorrow;
    Serial.printf("💤 Hết giờ làm. Ngủ đợi đến sáng mai %02d:%02d (còn %ld giây)\n", 
                  activeSlots[0].startHour, activeSlots[0].startMin, sleepUntilTomorrow);
    
    return sleepUntilTomorrow;
}

void enterDeepSleep(long seconds) {
    if (seconds <= 0) return;

    Serial.printf("😴 Chuẩn bị ngủ sâu trong %ld giây (%ld phút)...\n", seconds, seconds/60);

    // Hiển thị thông báo trước khi tắt
    if (xSemaphoreTake(tftMutex, portMAX_DELAY) == pdTRUE) {
        tft.fillScreen(TFT_BLACK);
        tft.setTextColor(TFT_DARKGREY, TFT_BLACK);  
        xSemaphoreGive(tftMutex);
        delay(100);
    }
    webSocket.disconnect();
    WiFi.disconnect(true);  // Ngắt kết nối và xóa config
    WiFi.mode(WIFI_OFF);
    esp_camera_deinit();
    SD_MMC.end();

    delay(120);
    
    rtc_gpio_pullup_en((gpio_num_t)WIFI_RESET_BTN);

    // Cấu hình đánh thức: Timer hoặc Nút bấm (GPIO 14)
    esp_sleep_enable_timer_wakeup(seconds * 1000000ULL); 
    esp_sleep_enable_ext0_wakeup((gpio_num_t)WIFI_RESET_BTN, 0); // 0 = LOW (nhấn nút)

    Serial.println("👋 Good night!");
    Serial.flush(); 
    esp_deep_sleep_start();
}


// Hàm tách chuỗi (Helper)
String getValue(String data, char separator, int index) {
    int found = 0;
    int strIndex[] = {0, -1};
    int maxIndex = data.length() - 1;

    for (int i = 0; i <= maxIndex && found <= index; i++) {
        if (data.charAt(i) == separator || i == maxIndex) {
            found++;
            strIndex[0] = strIndex[1] + 1;
            strIndex[1] = (i == maxIndex) ? i + 1 : i;
        }
    }
    return found > index ? data.substring(strIndex[0], strIndex[1]) : "";
}

// Hàm đồng bộ dữ liệu (Sync)
void syncOfflineData() {
    if (!SD_MMC.exists("/queue.txt")) return; // Không có gì để gửi

    Serial.println("🔄 [SYNC] Phát hiện dữ liệu Offline. Đang đồng bộ...");

    // Đổi tên file để tránh xung đột khi đang đọc
    SD_MMC.rename("/queue.txt", "/processing.txt");

    fs::File procFile = SD_MMC.open("/processing.txt", FILE_READ);
    if (!procFile) return;

    String newQueue = ""; // Lưu lại những dòng gửi thất bại (nếu có)
    bool hasError = false;

    while (procFile.available()) {
        String line = procFile.readStringUntil('\n');
        line.trim();
        if (line.length() == 0) continue;

        // Parse dữ liệu: TYPE|TIMESTAMP|EXTRA_DATA|IMG_PATH
        String type = getValue(line, '|', 0);
        String timestamp = getValue(line, '|', 1);
        String extraData = getValue(line, '|', 2);
        String imgPath = getValue(line, '|', 3);

        // Đọc ảnh từ SD
        fs::File imgFile = SD_MMC.open(imgPath, FILE_READ);
        if (imgFile) {
            size_t imgSize = imgFile.size();
            uint8_t* imgBuf = (uint8_t*) ps_malloc(imgSize);
            
            if (imgBuf) {
                imgFile.read(imgBuf, imgSize);
                imgFile.close();

                // Gửi lên Server (Logic giống sendImageToServer nhưng manual hơn)
                HTTPClient http;
                http.setTimeout(15000); // Timeout dài hơn chút
                String url = "http://" + String(server_ip_buffer) + ":" + String(server_port) + "/api/ai/" + type;
                http.begin(url);
                http.addHeader("Content-Type", "application/json");

                String b64 = base64::encode(imgBuf, imgSize);
                String payload = "{\"image\":\"" + b64 + "\",\"timestamp\":\"" + timestamp + "\",\"is_offline\":true";
                if (type == "enroll") payload += ",\"employee_id\":\"" + extraData + "\"";
                payload += "}";

                int httpCode = http.POST(payload);
                http.end();
                free(imgBuf);

                if (httpCode > 0 && httpCode < 400) {
                    Serial.printf("✅ [SYNC] Đã gửi bù: %s\n", imgPath.c_str());
                    // Xóa ảnh gốc để giải phóng thẻ nhớ
                    SD_MMC.remove(imgPath);
                } else {
                    Serial.printf("⚠️ [SYNC] Gửi lỗi (%d). Giữ lại dòng này.\n", httpCode);
                    newQueue += line + "\n";
                    hasError = true;
                }
            } else {
                Serial.println("❌ [SYNC] RAM không đủ để đọc ảnh!");
                newQueue += line + "\n"; // Giữ lại
                imgFile.close();
            }
        } else {
            // Ảnh không tồn tại -> Bỏ qua dòng này luôn
            Serial.printf("⚠️ [SYNC] Không tìm thấy ảnh %s -> Bỏ qua.\n", imgPath.c_str());
        }
    }
    procFile.close();
    SD_MMC.remove("/processing.txt");

    // Nếu có lỗi, ghi lại những dòng chưa gửi được vào queue.txt
    if (newQueue.length() > 0) {
        fs::File q = SD_MMC.open("/queue.txt", FILE_APPEND);
        q.print(newQueue);
        q.close();
    } else {
        Serial.println("🎉 [SYNC] Đồng bộ hoàn tất!");
    }
}
// =========================================================
// 1. HÀM XỬ LÝ ẢNH
// =========================================================

bool isLiveMotion(face_t f) {
    int cx = f.x + f.width / 2;
    int cy = f.y + f.height / 2;

    if (lastFace.x == 0 && lastFace.y == 0) {
        lastFace.x = cx; lastFace.y = cy;
        return false;
    }

    int dx = abs(cx - lastFace.x);
    int dy = abs(cy - lastFace.y);

    float movement = sqrt(dx*dx + dy*dy); 

    // --- THÊM ĐOẠN NÀY ĐỂ LẤY SỐ LIỆU ---
    Serial.print("MOTION_DATA:"); // Từ khóa để lọc
    Serial.println(movement);

    lastFace.x = cx; lastFace.y = cy;

    return ((dx > MOTION_THRESHOLD || dy > MOTION_THRESHOLD) && 
            (dx < MAX_MOTION && dy < MAX_MOTION));
}

// Cắt ảnh từ RGB565 -> Nén JPEG (Chạy trên RAM ESP32)
bool cropFaceFromRGB565(camera_fb_t* fb, face_t f, uint8_t** outBuf, size_t* outLen) {
    const int PAD = 30; // Lấy rộng ra chút để Python dễ align
    int x = max(0, f.x - PAD);
    int y = max(0, f.y - PAD);
    int w = min((int)(f.width + PAD * 2), (int)(fb->width - x));
    int h = min((int)(f.height + PAD * 2), (int)(fb->height - y));

    size_t cropSize = w * h * 2;
    uint8_t* cropBuf = (uint8_t*) ps_malloc(cropSize);
    if (!cropBuf) return false;

    for (int j = 0; j < h; j++) {
        uint8_t* srcPtr = fb->buf + ((y + j) * fb->width + x) * 2;
        uint8_t* destPtr = cropBuf + (j * w) * 2;
        memcpy(destPtr, srcPtr, w * 2);
    }

    // Nén JPEG chất lượng 90 để gửi đi
    bool ok = fmt2jpg(cropBuf, cropSize, w, h, PIXFORMAT_RGB565, 90, outBuf, outLen);
    free(cropBuf); 
    return ok;
}

// =========================================================
// 2. GIAO TIẾP SERVER
// =========================================================
String getIsoTime() {
    DateTime now = rtc.now();
    char buf[25];
    sprintf(buf, "%04d-%02d-%02dT%02d:%02d:%02d", now.year(), now.month(), now.day(), now.hour(), now.minute(), now.second());
    return String(buf);
}

String getDateTimeString() {
    DateTime now = rtc.now();
    char buf[25];
    sprintf(buf, "%02d/%02d/%04d %02d:%02d:%02d", now.day(), now.month(),now.year(), now.hour(), now.minute(), now.second());
    return String(buf);
}

void saveOfflineData(uint8_t* jpgBuf, size_t jpgLen, String type, String extraData) {
    if (!SD_MMC.cardSize()) {
        Serial.println("❌ [OFFLINE] Không tìm thấy thẻ SD!");
        return;
    }

    // 1. Tạo tên file ảnh dựa trên timestamp
    String timestamp = getIsoTime();
    // Thay thế ký tự đặc biệt để làm tên file (VD: 2023-10-25T10:00:00 -> 20231025_100000)
    String safeTime = timestamp;
    safeTime.replace("-", ""); safeTime.replace(":", ""); safeTime.replace("T", "_");
    
    String imgPath = "/off_" + safeTime + ".jpg";

    // 2. Lưu ảnh JPEG
    fs::File imgFile = SD_MMC.open(imgPath, FILE_WRITE);
    if (imgFile) {
        imgFile.write(jpgBuf, jpgLen);
        imgFile.close();
        Serial.printf("💾 [OFFLINE] Đã lưu ảnh: %s (%d bytes)\n", imgPath.c_str(), jpgLen);
    } else {
        Serial.println("❌ [OFFLINE] Lỗi ghi file ảnh!");
        return;
    }

    // 3. Ghi metadata vào hàng đợi (queue.txt)
    // Format: TYPE|TIMESTAMP|EXTRA_DATA|IMG_PATH
    fs::File queueFile = SD_MMC.open("/queue.txt", FILE_APPEND);
    if (queueFile) {
        String line = type + "|" + timestamp + "|" + extraData + "|" + imgPath + "\n";
        queueFile.print(line);
        queueFile.close();
        Serial.println("📝 [OFFLINE] Đã ghi vào hàng đợi.");
    } else {
        Serial.println("❌ [OFFLINE] Lỗi ghi file queue!");
    }
}


void wsSendTxt(String msg) {
    if (WiFi.status() == WL_CONNECTED) webSocket.sendTXT(msg);
}

// Gửi ảnh tổng quát (Dùng cho cả Enroll và Recognize)
String sendImageToServer(uint8_t* jpgBuf, size_t jpgLen, String type, String extraData = "") {
    unsigned long startNet = millis(); // Bắt đầu bấm giờ
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.setTimeout(8000); // 8s timeout

        String url = "http://" + String(server_ip_buffer) + ":" + String(server_port) + "/api/ai/" + type;
        http.begin(url);
        http.addHeader("Content-Type", "application/json");

        String b64 = base64::encode(jpgBuf, jpgLen);
        String payload = "{\"image\":\"" + b64 + "\",\"timestamp\":\"" + getIsoTime() + "\"";
        if (type == "enroll") payload += ",\"employee_id\":\"" + extraData + "\"";
        payload += "}";

        int httpCode = http.POST(payload);
        String res = (httpCode > 0) ? http.getString() : "error";
        http.end();
        unsigned long netDuration = millis() - startNet;
        Serial.printf("⏱️ [LATENCY] Network Round-trip: %lu ms\n", netDuration);

        // Nếu gửi thành công -> Trả về kết quả server
        if (httpCode > 0 && httpCode < 400) {
            return res;
        }
        Serial.printf("⚠️ [HTTP] Gửi lỗi (Code: %d). Chuyển sang lưu ngoại tuyến.\n", httpCode);
    } else {
        Serial.println("⚠️ [WIFI] Mất kết nối. Chuyển sang lưu ngoại tuyến.");
    }

    // 2. Nếu mất mạng hoặc gửi lỗi -> Lưu Offline
    // Chỉ lưu nhận diện (recognize) hoặc enroll, không lưu linh tinh
    saveOfflineData(jpgBuf, jpgLen, type, extraData);
    
    return "offline_saved";
}
// =========================================================
// 3. TASKS
// =========================================================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED: break;
        case WStype_CONNECTED: webSocket.sendTXT("role:device"); break;
        case WStype_TEXT:
            String text = (char*) payload;
            if (text.startsWith("enroll:")) {
                gEnrollName = text.substring(7);
                gEnrollingInProgress = true;
            }
            if (text == "restart") ESP.restart();
            else if (text.startsWith("{")) {
                JsonDocument doc;
                DeserializationError error = deserializeJson(doc, text);
                
                if (!error) {
                    const char* cmdType = doc["type"];
                    
                    // Nếu là gói tin config_time
                    if (strcmp(cmdType, "config_time") == 0) {
                        JsonArray data = doc["data"];
                        if (data.size() == NUM_SLOTS) {
                            for (int i = 0; i < NUM_SLOTS; i++) {
                                activeSlots[i].startHour = data[i][0];
                                activeSlots[i].startMin  = data[i][1];
                                activeSlots[i].endHour   = data[i][2];
                                activeSlots[i].endMin    = data[i][3];
                            }
                            saveTimeConfig(); // Lưu ngay
                            
                            // Phản hồi lại Web
                            webSocket.sendTXT("{\"type\":\"config_success\"}");
                            
                            // Vẽ thông báo lên màn hình
                            if (xSemaphoreTake(tftMutex, 100) == pdTRUE) {
                                tft.fillScreen(TFT_BLACK);
                                tft.setTextColor(TFT_GREEN, TFT_BLACK);
                                tft.drawCentreString("CAP NHAT", tft.width()/2, 100, 4);
                                tft.drawCentreString("THANH CONG", tft.width()/2, 140, 4);
                                xSemaphoreGive(tftMutex);
                                delay(2000);
                            }
                        }
                    }
                }
            }
            break;
    }
}

void NetworkTask(void *pvParameters) {
    static unsigned long lastSyncTime = 0;
    static unsigned long lastSleepCheck = 0;
    static bool lastWorkingState = true;
    for (;;) {
        webSocket.loop();
        
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("⚠️ WiFi Lost. Reconnecting...");
            WiFi.reconnect();
            vTaskDelay(pdMS_TO_TICKS(5000));
        } else {
            // Nếu có mạng -> Kiểm tra và đồng bộ mỗi 30 giây
            if (millis() - lastSyncTime > 30000) {
                if (!gEnrollingInProgress && xSemaphoreTake(camMutex, (TickType_t)100) == pdTRUE) {
                    syncOfflineData();
                    xSemaphoreGive(camMutex);
                }
                lastSyncTime = millis();
            }
        }

        if (millis() - lastSleepCheck > 60000) { 
            // Chỉ ngủ khi KHÔNG đang enroll và KHÔNG nhấn nút
            long sleepSecs = calculateSleepSeconds();
            bool isWorking = (sleepSecs == 0);
            gSystemIsWorking = isWorking;
            if (isWorking && !lastWorkingState) {
                // VỪA MỚI VÀO GIỜ LÀM (Chuyển từ Nghỉ -> Làm)
                Serial.println("🔔 Đã vào khung giờ làm việc! Bật màn hình...");
                if (xSemaphoreTake(tftMutex, (TickType_t)200) == pdTRUE) {
                    // Vẽ lại màn hình chào mừng hoặc clear đen để CameraTask vẽ đè lên
                    tft.fillScreen(TFT_BLACK);
                    tft.setTextColor(TFT_GREEN, TFT_BLACK);
                    tft.drawCentreString("SYSTEM READY", tft.width()/2, 120, 4);
                    xSemaphoreGive(tftMutex);
                }
            }
            if (!isWorking) {
                // Nếu đang không enroll và không giữ nút -> NGỦ
                if (!gEnrollingInProgress && digitalRead(WIFI_RESET_BTN) == HIGH) {
                    if (sleepSecs > 60 && millis() > 60000) {
                        enterDeepSleep(sleepSecs); // Hàm này sẽ reset ESP khi dậy
                    }
                    else if (millis() < 60000) {
                        Serial.println("⏳ Vừa khởi động, bỏ qua chế độ ngủ để chờ kết nối...");
                    }
                }
            }
            lastWorkingState = isWorking;
            lastSleepCheck = millis();
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void TimeSyncTask(void *pvParameters) {
    for (;;) {
        if (WiFi.status() == WL_CONNECTED) {
            configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
            struct tm timeinfo;
            if (getLocalTime(&timeinfo, 5000)) {
                rtc.adjust(DateTime(timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday, 
                                    timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec));
            }
        }
        vTaskDelay(pdMS_TO_TICKS(3600000));
    }
}


const char* enrollSteps[] = {
    "1. NHIN THANG",
    "2. QUAY TRAI NHE",
    "3. QUAY PHAI NHE",
    "4. NGUNG DAU LEN",
    "5. CUI DAU XUONG"
};
// --- TASK CHÍNH: CAMERA & LOGIC ---
void CameraAppTask(void *pvParameters) {    
    for (;;) {
        if (!gSystemIsWorking && !gEnrollingInProgress) {
            vTaskDelay(1000);
            continue;
        }
        if (gEnrollingInProgress) {
            Serial.println("--- ENROLL MODE STARTED ---");
            xSemaphoreTake(tftMutex, portMAX_DELAY);
            tft.fillScreen(TFT_BLACK);
            tft.setTextColor(TFT_CYAN, TFT_BLACK);
            tft.drawCentreString("CHE DO DANG KY", tft.width()/2, 10, 4); 
            tft.setTextColor(TFT_WHITE, TFT_BLACK);
            tft.drawCentreString("Chuan bi...", tft.width()/2, 50, 2);
            tft.setTextColor(TFT_YELLOW, TFT_BLACK);
            tft.drawCentreString("NHIN THANG CAMERA", tft.width()/2, 110, 2);

            xSemaphoreGive(tftMutex);
            vTaskDelay(3000);

            int currentStep = 0;
            
            while (currentStep < 5) {
                // 1. Chụp ảnh Preview
                xSemaphoreTake(camMutex, portMAX_DELAY);
                if (!camera.capture().isOk()) { 
                    xSemaphoreGive(camMutex); 
                    Serial.println("❌ [ENROLL] Capture Failed!");
                    vTaskDelay(50); continue; 
                }
                camera_fb_t* fb = camera.frame;
                xSemaphoreGive(camMutex);

                int xPos = (tft.width() - fb->width) / 2;
                
                // 2. Hiển thị Preview
                xSemaphoreTake(tftMutex, portMAX_DELAY);
                tft.pushImage(xPos, 0, fb->width, fb->height, (uint16_t*)fb->buf); 
                tft.setTextColor(TFT_YELLOW, TFT_BLACK); 
                tft.drawString(enrollSteps[currentStep], 5, 10, 4);
                xSemaphoreGive(tftMutex);

                // 3. Detect & Kiểm tra khoảng cách
                if (detection.run().isOk()) {
                    face_t f = detection.first;

                    // [LOGIC MỚI] KIỂM TRA KHOẢNG CÁCH CHO ENROLL
                    if (f.width < 55) {
                        xSemaphoreTake(tftMutex, portMAX_DELAY);
                        tft.setTextColor(TFT_ORANGE, TFT_BLACK); // Màu cam cảnh báo
                        tft.drawCentreString("LAI GAN HON", tft.width()/2, 195, 4);
                        xSemaphoreGive(tftMutex);
                    }
                    else if (f.width > 110) {
                        xSemaphoreTake(tftMutex, portMAX_DELAY);
                        tft.setTextColor(TFT_ORANGE, TFT_BLACK);
                        tft.drawCentreString("XA RA CHUT", tft.width()/2, 195, 4);
                        xSemaphoreGive(tftMutex);
                    }
                    else {
                        if (f.score > 0.85) {
                            xSemaphoreTake(tftMutex, portMAX_DELAY);
                            // Vẽ khung xanh xác nhận
                            tft.drawRect(xPos + f.x, f.y, f.width, f.height, TFT_GREEN);
                            xSemaphoreGive(tftMutex);

                            // Chờ 1 chút cho người dùng ổn định tư thế
                            vTaskDelay(1000); 

                            // Chụp ảnh thật để gửi
                            xSemaphoreTake(camMutex, portMAX_DELAY); 
                            camera.capture(); 
                            fb = camera.frame; 
                            xSemaphoreGive(camMutex);

                            uint8_t* faceBuf = nullptr; size_t faceLen = 0;
                            if(cropFaceFromRGB565(fb, f, &faceBuf, &faceLen)) {
                                xSemaphoreTake(tftMutex, portMAX_DELAY);
                                Serial.printf("📤 [ENROLL] Đang gửi ảnh %d (%d bytes)...\n", currentStep+1, faceLen);
                                tft.fillCircle(tft.width()-20, 20, 8, TFT_BLUE); 
                                xSemaphoreGive(tftMutex);

                                String res = sendImageToServer(faceBuf, faceLen, "enroll", gEnrollName);
                                free(faceBuf);
                                
                                if (res.indexOf("collecting") > 0 || res.indexOf("success") > 0) {
                                    Serial.printf("✅ [ENROLL] Hoàn thành bước %d!\n", currentStep+1);
                                    
                                    xSemaphoreTake(tftMutex, portMAX_DELAY);
                                    tft.fillScreen(TFT_GREEN);
                                    tft.setTextColor(TFT_BLACK, TFT_GREEN);
                                    String doneMsg = "XONG BUOC " + String(currentStep + 1);
                                    tft.drawCentreString(doneMsg, tft.width()/2, 100, 4);
                                    
                                    // Nhắc chuyển sang bước sau
                                    if (currentStep < 4) {
                                       tft.drawCentreString("Tiep tuc...", tft.width()/2, 140, 2);
                                    }
                                    xSemaphoreGive(tftMutex);
                                    vTaskDelay(2000);
                                    
                                    xSemaphoreTake(tftMutex, portMAX_DELAY);
                                    tft.fillScreen(TFT_BLACK);
                                    xSemaphoreGive(tftMutex);
                                    currentStep++;
                                }
                                else{
                                    Serial.printf("⚠️ [ENROLL] Server từ chối bước %d. Thử lại.\n", currentStep+1);
                                    // Hiện thông báo lỗi nếu cần
                                }
                            }
                        }
                    }
                }
                vTaskDelay(100);
            }
            Serial.println("🎉 --- ENROLL FINISHED ---");
            gEnrollingInProgress = false;
            wsSendTxt("enroll_done");
            
            xSemaphoreTake(tftMutex, portMAX_DELAY);
            tft.fillScreen(TFT_BLUE);
            tft.setTextColor(TFT_WHITE, TFT_BLUE);
            tft.drawCentreString("HOAN TAT!", tft.width()/2, 100, 4);
            xSemaphoreGive(tftMutex);
            vTaskDelay(3000);

            xSemaphoreTake(tftMutex, portMAX_DELAY);
            tft.fillScreen(TFT_BLACK); 
            xSemaphoreGive(tftMutex);

            continue;
        }

        camera_fb_t* fb = nullptr;
        xSemaphoreTake(camMutex, portMAX_DELAY);
        if (camera.capture().isOk()) fb = camera.frame;
        xSemaphoreGive(camMutex);
        if (!fb) { vTaskDelay(30); continue; }

        int xPos = (tft.width() - fb->width) / 2;

        xSemaphoreTake(tftMutex, portMAX_DELAY);
        tft.pushImage(xPos, 0, fb->width, fb->height, (uint16_t*)fb->buf); 
        tft.setTextColor(TFT_GREEN, TFT_BLACK);
        tft.setTextDatum(TL_DATUM);
        tft.drawString(getDateTimeString(), 5, 220, 2);
        xSemaphoreGive(tftMutex);

        if (detection.run().isOk()) {
            face_t f = detection.first;
            Serial.printf("📏 [METRICS] Width: %d px | Confidence: %.2f\n", f.width, f.score);
            int bX = f.x; int bY = f.y; int bW = f.width; int bH = f.height;
            // Xử lý tọa độ âm
            if (bX < 0) { bW += bX; bX = 0; }
            if (bY < 0) { bH += bY; bY = 0; }
            // Xử lý tràn phải/dưới (fb->width thường là 240)
            if (bX + bW > fb->width)  bW = fb->width - bX;
            if (bY + bH > fb->height) bH = fb->height - bY;

            // Chỉ vẽ nếu kích thước > 0
            if (bW > 0 && bH > 0) {
                xSemaphoreTake(tftMutex, portMAX_DELAY);
                tft.drawRect(xPos + bX, bY, bW, bH, TFT_CYAN); 
                xSemaphoreGive(tftMutex);
            }

            // [LOGIC KHOẢNG CÁCH CHO RECOGNIZE]
            if (f.width < 55) {
                xSemaphoreTake(tftMutex, portMAX_DELAY);
                tft.setTextColor(TFT_ORANGE, TFT_BLACK);
                tft.drawCentreString("LAI GAN HON", tft.width()/2, 195, 4);
                xSemaphoreGive(tftMutex);
            }
            else if (f.width > 110) {
                xSemaphoreTake(tftMutex, portMAX_DELAY);
                tft.setTextColor(TFT_ORANGE, TFT_BLACK);
                tft.drawCentreString("XA RA CHUT", tft.width()/2, 195, 4);
                xSemaphoreGive(tftMutex);
            }
            else {
                // KHOẢNG CÁCH OK -> BURST MODE
                if(f.score > 0.80 && isLiveMotion(f) && (millis() - lastCaptureTime > 1000)) {
                
                    Serial.println("🚀 Bắt đầu gửi chuỗi 3 ảnh (Burst Mode)...");
                    
                    bool detectionDone = false; 
                    int attempts = 0;           

                    while (!detectionDone && attempts < 3) {
                        attempts++;

                        if (attempts > 1) {
                            xSemaphoreTake(camMutex, portMAX_DELAY);
                            camera.capture(); 
                            fb = camera.frame;
                            xSemaphoreGive(camMutex);

                            xSemaphoreTake(tftMutex, portMAX_DELAY);
                            tft.pushImage(xPos, 0, fb->width, fb->height, (uint16_t*)fb->buf);
                            xSemaphoreGive(tftMutex);
                            
                            if (!detection.run().isOk()) {
                                Serial.println("⚠️ Mất dấu khuôn mặt -> Hủy Burst");
                                break; 
                            }
                            f = detection.first; 
                        }

                        uint8_t* faceBuf = nullptr; size_t faceLen = 0;
                        
                        if (cropFaceFromRGB565(fb, f, &faceBuf, &faceLen)) {
                            unsigned long startTick = millis();
                            Serial.printf("📡 Gửi ảnh thứ %d/3...\n", attempts);
                            
                            String res = sendImageToServer(faceBuf, faceLen, "recognize");
                            unsigned long duration = millis() - startTick;
                            free(faceBuf); 

                            if (res == "offline_saved") {
                                xSemaphoreTake(tftMutex, portMAX_DELAY);
                                tft.setTextColor(TFT_ORANGE, TFT_BLACK);
                                tft.drawCentreString("DA LUU OFFLINE", 120, 200, 2);
                                xSemaphoreGive(tftMutex);
                                vTaskDelay(1000);
                                detectionDone = true;
                            }
                            else if (res.indexOf("collecting") > 0) {
                                vTaskDelay(50);
                                continue; 
                            }
                            else if (res.indexOf("match\":true") > 0) {
                                int n1 = res.indexOf("name\":\"") + 7;
                                int n2 = res.indexOf("\"", n1);
                                String name = res.substring(n1, n2);
                                Serial.printf("✅ MATCHED: %s\n", name.c_str());
                                
                                xSemaphoreTake(tftMutex, portMAX_DELAY);
                                tft.fillScreen(TFT_GREEN); 
                                tft.setTextColor(TFT_BLACK, TFT_GREEN);
                                tft.drawCentreString("XIN CHAO", tft.width()/2, 100, 2);
                                tft.drawCentreString(name, tft.width()/2, 130, 4);
                                xSemaphoreGive(tftMutex);
                                vTaskDelay(2000); 

                                xSemaphoreTake(tftMutex, portMAX_DELAY);
                                tft.fillScreen(TFT_BLACK); 
                                xSemaphoreGive(tftMutex);

                                lastCaptureTime = millis();
                                detectionDone = true;      
                            }
                            else if (res.indexOf("match\":false") > 0) {
                                Serial.println("❌ NGUOI LA");
                                xSemaphoreTake(tftMutex, portMAX_DELAY);
                                tft.setTextColor(TFT_RED, TFT_BLACK); 
                                tft.drawCentreString("NGUOI LA", tft.width()/2, 200, 2);
                                xSemaphoreGive(tftMutex);
                                vTaskDelay(1000);
                                
                                xSemaphoreTake(tftMutex, portMAX_DELAY); 
                                tft.fillScreen(TFT_BLACK); 
                                xSemaphoreGive(tftMutex);

                                lastCaptureTime = millis();
                                detectionDone = true; 
                            }
                        } 
                    } 
                }
            }
        }
        vTaskDelay(20);
    }
}

void setup() {
    Serial.begin(115200);

    loadTimeConfig();

    esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();
    if (wakeup_reason == ESP_SLEEP_WAKEUP_EXT0) {
        Serial.println("🔔 Đã thức dậy thủ công bằng nút bấm!");
    } else if (wakeup_reason == ESP_SLEEP_WAKEUP_TIMER) {
        Serial.println("⏰ Đã thức dậy theo lịch trình!");
    }

    Wire.begin(SDA_PIN, SCL_PIN);
    rtc.begin();
    if (! rtc.begin()) {
        Serial.println("LOI: Khong tim thay module RTC DS3231!");
    }
    SD_MMC.setPins(39, 38, 40); 
    if(!SD_MMC.begin("/sd", true)){ 
        Serial.println("❌ LOI: Khong the khoi tao SD Card!");
    } else {
        Serial.println("✅ SD Card OK.");
        
        uint64_t cardSize = SD_MMC.cardSize() / (1024 * 1024);
        uint64_t totalBytes = SD_MMC.totalBytes() / (1024 * 1024);
        uint64_t usedBytes = SD_MMC.usedBytes() / (1024 * 1024);
        
        Serial.println("📊 --- SD CARD INFO ---");
        Serial.printf("   💾 Dung luong The: %llu MB\n", cardSize);
        Serial.printf("   💾 Tong vung luu tru: %llu MB\n", totalBytes);
        Serial.printf("   💾 Da su dung: %llu MB\n", usedBytes);
        Serial.printf("   💾 Con trong:  %llu MB\n", totalBytes - usedBytes);
        Serial.println("-----------------------");
    }

    tft.init(); tft.setRotation(3); tft.fillScreen(TFT_BLACK);

    pinMode(WIFI_RESET_BTN, INPUT_PULLUP);

    camera.pinout.freenove_s3();
    camera.xclk.slow();
    camera.brownout.disable();
    camera.resolution.face(); // 240x240
    camera.quality.best();
    camera.pixformat.rgb565(); // Hiển thị mượt
    detection.accurate();
    detection.confidence(0.70);

    
    
    if (!camera.begin().isOk()) { 
        tft.drawString("Cam Err", 0, 0); 
        while(1) delay(100); 
    }
    // ====== BASIC ======
    camera.sensor.setBrightness(1);     // +1 là hợp lý
    camera.sensor.setSaturation(1);     // ❗ KHÔNG để 0
    camera.sensor.setAutomaticWhiteBalance(true);
    camera.sensor.setAutomaticGainControl(true);
    camera.sensor.setExposureControl(true);

    // // ====== ADVANCED ======
    camera.sensor.configure([](sensor_t *s) {

        s->set_contrast(s, 1);          // Tăng tương phản
            s->set_lenc(s, 1);              // Lens correction (Sáng 4 góc)
            s->set_dcw(s, 1);               // Khử sai màu
    });

    

    preferences.begin("kiosk-config", false);
    strcpy(server_ip_buffer, "192.168.137.1"); 
    preferences.putString("server_ip", server_ip_buffer);

    WiFiManager wm;
    pinMode(WIFI_RESET_BTN, INPUT_PULLUP);
    
    WiFiManagerParameter custom_ip("server", "IP Server", server_ip_buffer, 40);
    wm.addParameter(&custom_ip);
    if (!wm.autoConnect("ChamCong", "12345678")) ESP.restart();
    
    if (String(custom_ip.getValue()).length() > 0) {
        strcpy(server_ip_buffer, custom_ip.getValue());
        preferences.putString("server_ip", server_ip_buffer);
    }

    webSocket.begin(server_ip_buffer, server_port, "/ws");
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);

    tftMutex = xSemaphoreCreateMutex();
    camMutex = xSemaphoreCreateMutex();

    xTaskCreatePinnedToCore(NetworkTask, "NetTask", 10240, NULL, 3, NULL, 0);
    xTaskCreatePinnedToCore(TimeSyncTask, "TimeTask", 2048, NULL, 1, NULL, 1);
    xTaskCreatePinnedToCore(CameraAppTask, "AppTask", 16384, NULL, 2, NULL, 1);

    Serial.println("System Ready!");

    Serial.println("⚙️ --- SYSTEM STATUS ---");
    Serial.printf("   🔹 Chip Model: %s (Rev %d)\n", ESP.getChipModel(), ESP.getChipRevision());
    Serial.printf("   🔹 CPU Freq: %d MHz\n", ESP.getCpuFreqMHz());
    Serial.printf("   🔹 Free RAM (Heap): %d bytes\n", ESP.getFreeHeap());
    if (xSemaphoreTake(tftMutex, (TickType_t)100) == pdTRUE) {
        tft.fillScreen(TFT_BLACK);
        xSemaphoreGive(tftMutex);
    }
}

void loop() {
    vTaskDelay(pdMS_TO_TICKS(1000));
}