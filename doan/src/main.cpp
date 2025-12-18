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
#include "img_converters.h" // [QUAN TRỌNG] Thư viện xử lý ảnh

// --- CẤU HÌNH PIN ---
#define WIFI_RESET_BTN 14

// --- BIẾN TOÀN CỤC ---
Preferences preferences;
char server_ip_buffer[40] = "192.168.88.119"; 
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
                String payload = "{\"image\":\"" + b64 + "\",\"timestamp\":\"" + timestamp + "\"";
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
    sprintf(buf, "%02d/%02d %02d:%02d", now.day(), now.month(), now.hour(), now.minute());
    return String(buf);
}

void wsSendTxt(String msg) {
    if (WiFi.status() == WL_CONNECTED) webSocket.sendTXT(msg);
}

// Gửi ảnh tổng quát (Dùng cho cả Enroll và Recognize)
String sendImageToServer(uint8_t* jpgBuf, size_t jpgLen, String type, String extraData = "") {
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

        // Nếu gửi thành công -> Trả về kết quả server
        if (httpCode > 0 && httpCode < 400) {
            return res;
        }
        Serial.printf("⚠️ [HTTP] Gửi lỗi (Code: %d). Chuyển sang lưu Offline.\n", httpCode);
    } else {
        Serial.println("⚠️ [WIFI] Mất kết nối. Chuyển sang lưu Offline.");
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
            break;
    }
}

void NetworkTask(void *pvParameters) {
    static unsigned long lastSyncTime = 0;
    for (;;) {
        webSocket.loop();
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("⚠️ WiFi Lost. Reconnecting...");
            WiFi.reconnect();
            vTaskDelay(pdMS_TO_TICKS(5000));
        }
        else {
            // Nếu có mạng -> Kiểm tra và đồng bộ mỗi 30 giây
            if (millis() - lastSyncTime > 30000) {
                // Chỉ đồng bộ khi không đang enroll hoặc bận camera
                if (!gEnrollingInProgress && xSemaphoreTake(camMutex, (TickType_t)10) == pdTRUE) {
                    xSemaphoreGive(camMutex); // Check xong nhả ra ngay
                    syncOfflineData();
                }
                lastSyncTime = millis();
            }
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
        // =========================================================
        // 1. MODE ENROLL (SỬA LỖI DÍNH MÀU XANH DƯƠNG)
        // =========================================================
        if (gEnrollingInProgress) {
            Serial.println("--- ENROLL MODE STARTED ---");
            xSemaphoreTake(tftMutex, portMAX_DELAY);
            tft.fillScreen(TFT_BLACK);
            tft.setTextColor(TFT_CYAN, TFT_BLACK);
            tft.drawCentreString("CHE DO DANG KY", tft.width()/2, 10, 4); // Căn giữa theo chiều rộng màn hình
            tft.setTextColor(TFT_WHITE, TFT_BLACK);
            tft.drawCentreString("Chuan bi...", tft.width()/2, 50, 2);
            xSemaphoreGive(tftMutex);
            vTaskDelay(1500);

            int currentStep = 0;
            
            while (currentStep < 5) {
                // 1. Chụp ảnh
                xSemaphoreTake(camMutex, portMAX_DELAY);
                if (!camera.capture().isOk()) { 
                    xSemaphoreGive(camMutex); 
                    Serial.println("❌ [ENROLL] Capture Failed!");
                    vTaskDelay(50); continue; 
                }
                camera_fb_t* fb = camera.frame;
                xSemaphoreGive(camMutex);

                // [MẸO] Tính tọa độ để CĂN GIỮA MÀN HÌNH
                int xPos = (tft.width() - fb->width) / 2;
                
                // 2. Hiển thị
                xSemaphoreTake(tftMutex, portMAX_DELAY);
                tft.pushImage(xPos, 0, fb->width, fb->height, (uint16_t*)fb->buf); // Vẽ ở giữa
                tft.setTextColor(TFT_YELLOW, TFT_BLACK); 
                tft.drawString(enrollSteps[currentStep], 5, 10, 4);
                xSemaphoreGive(tftMutex);

                // 3. Detect
                if (detection.run().isOk()) {
                    face_t f = detection.first;
                    if (f.score > 0.85 && f.width > 35) {
                        xSemaphoreTake(tftMutex, portMAX_DELAY);
                        // Vẽ khung xanh (cộng thêm xPos vì hình đã dịch chuyển)
                        tft.drawRect(xPos + f.x, f.y, f.width, f.height, TFT_GREEN);
                        xSemaphoreGive(tftMutex);

                        vTaskDelay(500);

                        xSemaphoreTake(camMutex, portMAX_DELAY); camera.capture(); fb = camera.frame; xSemaphoreGive(camMutex);

                        uint8_t* faceBuf = nullptr; size_t faceLen = 0;
                        if(cropFaceFromRGB565(fb, f, &faceBuf, &faceLen)) {
                            xSemaphoreTake(tftMutex, portMAX_DELAY);
                            Serial.printf("📤 [ENROLL] Đang gửi ảnh %d (%d bytes)...\n", currentStep+1, faceLen);
                            tft.fillCircle(tft.width()-20, 20, 8, TFT_BLUE); // Đèn báo góc phải
                            xSemaphoreGive(tftMutex);

                            String res = sendImageToServer(faceBuf, faceLen, "enroll", gEnrollName);
                            free(faceBuf);
                            

                            if (res.indexOf("collecting") > 0 || res.indexOf("success") > 0) {
                                Serial.printf("✅ [ENROLL] Hoàn thành bước %d!\n", currentStep+1);
                                currentStep++; 
                                xSemaphoreTake(tftMutex, portMAX_DELAY);
                                tft.fillScreen(TFT_GREEN);
                                tft.setTextColor(TFT_BLACK, TFT_GREEN);
                                tft.drawCentreString("OK", tft.width()/2, 120, 4);
                                xSemaphoreGive(tftMutex);
                                vTaskDelay(1000); 
                                
                                // [QUAN TRỌNG] Xóa màn hình đen sau mỗi bước
                                xSemaphoreTake(tftMutex, portMAX_DELAY);
                                tft.fillScreen(TFT_BLACK);
                                xSemaphoreGive(tftMutex);
                            }
                            else{
                                Serial.printf("⚠️ [ENROLL] Server từ chối bước %d. Thử lại.\n", currentStep+1);
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

            // [FIX LỖI DÍNH MÀU XANH DƯƠNG]
            xSemaphoreTake(tftMutex, portMAX_DELAY);
            tft.fillScreen(TFT_BLACK); // Xóa sạch trước khi quay lại camera
            xSemaphoreGive(tftMutex);

            continue;
        }

        // =========================================================
        // 2. MODE RECOGNIZE (SỬA LỖI DÍNH MÀU XANH LÁ)
        // =========================================================
        camera_fb_t* fb = nullptr;
        xSemaphoreTake(camMutex, portMAX_DELAY);
        if (camera.capture().isOk()) fb = camera.frame;
        xSemaphoreGive(camMutex);
        if (!fb) { vTaskDelay(30); continue; }

        // [GIỮ NGUYÊN] CĂN GIỮA CAMERA
        int xPos = (tft.width() - fb->width) / 2;

        xSemaphoreTake(tftMutex, portMAX_DELAY);
        tft.pushImage(xPos, 0, fb->width, fb->height, (uint16_t*)fb->buf); 
        tft.setTextColor(TFT_GREEN, TFT_BLACK);
        tft.setTextDatum(TL_DATUM);
        tft.drawString(getDateTimeString(), 5, 220, 2);
        xSemaphoreGive(tftMutex);

        if (detection.run().isOk()) {
            face_t f = detection.first;
            
            xSemaphoreTake(tftMutex, portMAX_DELAY);
            tft.drawRect(xPos + f.x, f.y, f.width, f.height, TFT_CYAN); 
            xSemaphoreGive(tftMutex);

            // ĐIỀU KIỆN KÍCH HOẠT BURST MODE
            if (f.width > 30 && f.score > 0.80 && isLiveMotion(f) && (millis() - lastCaptureTime > 1000)) {
                
                Serial.println("🚀 Bắt đầu gửi chuỗi 3 ảnh (Burst Mode)...");
                
                bool detectionDone = false; // Cờ đánh dấu đã xong việc
                int attempts = 0;           // Đếm số ảnh đã gửi

                // Vòng lặp gửi tối đa 4 lần (để đảm bảo đủ 3 ảnh cho server)
                while (!detectionDone && attempts < 4) {
                    attempts++;

                    // [QUAN TRỌNG] TỪ ẢNH THỨ 2 TRỞ ĐI PHẢI CHỤP MỚI
                    // Nếu không chụp mới, bạn sẽ gửi 3 ảnh giống hệt nhau -> Liveness sai
                    if (attempts > 1) {
                        xSemaphoreTake(camMutex, portMAX_DELAY);
                        camera.capture(); // Chụp khung hình mới
                        fb = camera.frame;
                        xSemaphoreGive(camMutex);

                        // Vẽ lại màn hình để người dùng thấy mình đang hoạt động
                        xSemaphoreTake(tftMutex, portMAX_DELAY);
                        tft.pushImage(xPos, 0, fb->width, fb->height, (uint16_t*)fb->buf);
                        // tft.drawCircle(220, 20, 8, TFT_YELLOW); // Đèn vàng nháy: Đang gửi
                        xSemaphoreGive(tftMutex);
                        
                        // Detect lại trên khung hình mới để lấy tọa độ crop chuẩn
                        if (!detection.run().isOk()) {
                            Serial.println("⚠️ Mất dấu khuôn mặt giữa chừng -> Hủy Burst");
                            break; 
                        }
                        f = detection.first; // Cập nhật tọa độ mặt mới
                    }

                    uint8_t* faceBuf = nullptr; size_t faceLen = 0;
                    
                    if (cropFaceFromRGB565(fb, f, &faceBuf, &faceLen)) {
                        unsigned long startTick = millis();
                        Serial.printf("📡 Gửi ảnh thứ %d/3...\n", attempts);
                        
                        // Gửi ảnh và CHỜ kết quả (Synchronous)
                        String res = sendImageToServer(faceBuf, faceLen, "recognize");

                        unsigned long endTick = millis();
                        unsigned long duration = endTick - startTick;
                        free(faceBuf); // Giải phóng RAM ngay

                        if (res == "offline_saved") {
                            xSemaphoreTake(tftMutex, portMAX_DELAY);
                            tft.setTextColor(TFT_ORANGE, TFT_BLACK); // Màu cam cảnh báo
                            tft.drawCentreString("DA LUU OFFLINE", 120, 200, 2);
                            xSemaphoreGive(tftMutex);
                            vTaskDelay(1000);
                        }

                        // --- XỬ LÝ KẾT QUẢ TỪ SERVER ---

                        // 1. Server bảo "Đang gom" (collecting) -> Tiếp tục vòng lặp để gửi ảnh tiếp theo
                        else if (res.indexOf("collecting") > 0) {
                            // Không làm gì cả, vòng while sẽ tự chạy tiếp để gửi ảnh sau
                            vTaskDelay(50); // Nghỉ 50ms giữa các lần chụp
                            continue; 
                        }
                        
                        // 2. Server trả kết quả MATCH -> Xong việc
                        else if (res.indexOf("match\":true") > 0) {
                            int n1 = res.indexOf("name\":\"") + 7;
                            int n2 = res.indexOf("\"", n1);
                            String name = res.substring(n1, n2);
                            Serial.printf("✅ MATCHED: %s\n", name.c_str());
                            Serial.printf("⏱️ THỜI GIAN XỬ LÝ: %lu ms (%.2f giây)\n", duration, duration / 1000.0);
                            
                            xSemaphoreTake(tftMutex, portMAX_DELAY);
                            tft.fillScreen(TFT_GREEN); 
                            tft.setTextColor(TFT_BLACK, TFT_GREEN);
                            tft.drawCentreString("XIN CHAO", tft.width()/2, 100, 2);
                            tft.drawCentreString(name, tft.width()/2, 130, 4);
                            xSemaphoreGive(tftMutex);
                            
                            vTaskDelay(2000); 

                            // Xóa màn hình
                            xSemaphoreTake(tftMutex, portMAX_DELAY);
                            tft.fillScreen(TFT_BLACK); 
                            xSemaphoreGive(tftMutex);

                            lastCaptureTime = millis(); // Reset thời gian chờ
                            detectionDone = true;       // Thoát vòng lặp
                        }
                        
                        // 3. Server trả kết quả KHÔNG MATCH -> Xong việc
                        else if (res.indexOf("match\":false") > 0) {
                            Serial.println("❌ UNKNOWN");
                            xSemaphoreTake(tftMutex, portMAX_DELAY);
                            tft.setTextColor(TFT_RED, TFT_BLACK); 
                            tft.drawCentreString("UNKNOWN", tft.width()/2, 200, 2);
                            xSemaphoreGive(tftMutex);
                            
                            vTaskDelay(1000);
                            
                            xSemaphoreTake(tftMutex, portMAX_DELAY); // Xóa màn hình cho sạch
                            tft.fillScreen(TFT_BLACK); 
                            xSemaphoreGive(tftMutex);

                            lastCaptureTime = millis();
                            detectionDone = true; // Thoát vòng lặp
                        }
                    } 
                } // Kết thúc while
            }
        }
        vTaskDelay(20);
    }
}

// =========================================================
// SETUP
// =========================================================
void setup() {
    Serial.begin(115200);

    Wire.begin(47, 21);
    rtc.begin();
    if (! rtc.begin()) {
        Serial.println("LOI: Khong tim thay module RTC DS3231!");
    }
    SD_MMC.setPins(39, 38, 40); 
    if(!SD_MMC.begin("/sd", true)){ 
        Serial.println("LOI: Khong the khoi tao SD Card!");
    } else {
        Serial.println("SD Card OK.");

    }

    tft.init(); tft.setRotation(3); tft.fillScreen(TFT_BLACK);

    pinMode(WIFI_RESET_BTN, INPUT_PULLUP);

    camera.pinout.freenove_s3();
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
camera.sensor.setBrightness(0);     // +1 là hợp lý
camera.sensor.setSaturation(1);     // ❗ KHÔNG để 0
camera.sensor.setAutomaticWhiteBalance(true);
camera.sensor.setAutomaticGainControl(true);
camera.sensor.setExposureControl(true);

// // ====== ADVANCED ======
camera.sensor.configure([](sensor_t *s) {

    s->set_contrast(s, 1);          // Tăng tương phản
        s->set_lenc(s, 1);              // Lens correction (Sáng 4 góc)
        s->set_dcw(s, 1);               // Khử sai màu
        // s->set_sharpness(s, 1);
});

    

    preferences.begin("kiosk-config", false);
    String savedIP = preferences.getString("server_ip", "");
    if(savedIP.length()>0) strcpy(server_ip_buffer, savedIP.c_str());

    WiFiManager wm;
    pinMode(WIFI_RESET_BTN, INPUT_PULLUP);
    if(digitalRead(WIFI_RESET_BTN) == LOW) { wm.resetSettings(); delay(1000); }
    
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

    xTaskCreatePinnedToCore(NetworkTask, "NetTask", 4096, NULL, 3, NULL, 0);
    xTaskCreatePinnedToCore(TimeSyncTask, "TimeTask", 2048, NULL, 1, NULL, 1);
    xTaskCreatePinnedToCore(CameraAppTask, "AppTask", 16384, NULL, 2, NULL, 1);

    Serial.println("System Ready!");
}

void loop() {
    vTaskDelay(pdMS_TO_TICKS(1000));
}