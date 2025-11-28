#include <Arduino.h>
#include <eloquent_esp32cam.h>
#include <eloquent_esp32cam/face/detection.h>
#include <eloquent_esp32cam/face/recognition.h> 
#include <TFT_eSPI.h>
#include <WiFi.h>
#include <HTTPClient.h> 

#include <FS.h>       
#include <SPIFFS.h> 
#include "esp_camera.h"
// FreeRTOS
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include <time.h>
#include <ctype.h>

#include <WebSocketsClient.h> 

#include <Wire.h>     
#include <RTClib.h>   
#include <SD_MMC.h>
#include "config.h"
#include <Preferences.h>
#include <WiFiManager.h>

#define WIFI_RESET_BTN 14
Preferences preferences;
char server_ip_buffer[40];
unsigned long btnPressStart = 0;
bool btnPressed = false;

RTC_DS3231 rtc; 

using eloq::camera;


using eloq::face_t;
using eloq::face::detection;
using eloq::face::recognition;


// --- Khai báo trước các hàm ---
void setupWiFiAndConfig();
void sendAttendanceProof(String employeeId);
static void setupTime();


typedef struct {
    char employee[48];
    char timestamp[32];
    uint8_t *data;
    size_t len;
} UploadJob;
static QueueHandle_t uploadQueue = NULL; 
SemaphoreHandle_t camAIMutex = NULL;     
static TaskHandle_t g_senderTaskHandle = NULL;
static TaskHandle_t g_enrollTaskHandle = NULL;
static TaskHandle_t g_recogTaskHandle = NULL;
static TaskHandle_t g_wsTaskHandle = NULL; 
static TaskHandle_t g_syncTaskHandle = NULL; 

typedef struct {
    char name[48];
    int samples;
} EnrollJob;
static QueueHandle_t enrollQueue = NULL; 
TFT_eSPI tft = TFT_eSPI();
static void senderTask(void *pvParameters);
static void enrollTask(void *pvParameters);
static void recognitionTask(void *pvParameters);
static void wsTask(void *pvParameters);
static void syncTask(void *pvParameters); 

static bool wsSendTxt(const String &msg);
WebSocketsClient wsClient;
bool wsConnected = false;
typedef struct { char payload[128]; } WSMessage;
static QueueHandle_t wsSendQueue = NULL;
static volatile bool gEnrollingInProgress = false;  
static String wsHost = "";
static uint16_t wsPort = 80;
static void handleWsMessage(const String &msg);
static void clearRecognitionDatabase();
static void dumpRecognitionDatabase();
static void enrollRoutine(const String &name, int samples = 5);
static void syncOfflineLogs();
unsigned long lastRecognitionTime = 0; 
const unsigned long COOLDOWN_PERIOD = 10000; 
const float RECOG_SIMILARITY_THRESHOLD = 0.95f; 
const unsigned long RECOG_MIN_INTERVAL_MS = 300;   
const int RECOG_STABLE_FRAMES = 3;                 
const int RECOG_MIN_FACE_AREA = 2000;              
const int RECOG_MAX_CENTER_DELTA = 12;             
bool faceWasPresentInPreviousFrame = false;
const int REQUIRED_CONSISTENT_MATCHES = 3; 
const unsigned long CONSISTENT_WINDOW_MS = 2000; 
static String lastCandidateName = "";
static int candidateCount = 0;
static unsigned long candidateLastSeen = 0;
static int gStableFrames = 0;
static int gLastCX = -1, gLastCY = -1;
static size_t gLastArea = 0;
static unsigned long gLastRecognitionAttempt = 0;

//Cấu hình thời gian cho hệ thống, ưu tiên lấy từ server NTP, nếu thất bại thì dùng từ module RTC DS3231.
static void setupTime() {
    if (! rtc.begin()) {
        Serial.println("LOI: Khong tim thay module RTC DS3231!");
        tft.fillScreen(TFT_RED);
        tft.drawString("LOI: Mat RTC DS3231", 5, 100, 2);
        while (1) delay(1000); 
    }
    Serial.println("RTC DS3231 OK.");
    if (rtc.lostPower()) {
        Serial.println("RTC bi mat nguon (pin CR2032 yeu/het?), can dong bo NTP!");
    }
    bool ntpSynced = false;
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("Dang thu dong bo NTP...");
        configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
        int ntp_attempts = 0;
        while (time(NULL) < 1600000000 && ntp_attempts < 20) { 
            Serial.print(".");
            delay(500);
            ntp_attempts++;
        }
        if (time(NULL) > 1600000000) {
            Serial.println("\nDong bo NTP thanh cong!");
            ntpSynced = true;
            rtc.adjust(DateTime(time(NULL)));
            Serial.println("Da hieu chinh RTC bang gio NTP (luu UTC).");
        } else {
            Serial.println("\nLoi: Khong the dong bo NTP.");
        }
    } else {
        Serial.println("Khong co Wi-Fi, bo qua NTP.");
    }
    if (!ntpSynced) {
        Serial.println("Su dung gio tu RTC DS3231 lam gio he thong.");
        DateTime now_utc = rtc.now(); 
        DateTime now_local = now_utc + TimeSpan(GMT_OFFSET_SEC);
        Serial.println("Da chuyen doi UTC -> GMT+7 (Offline).");
        struct timeval tv;
        tv.tv_sec = now_local.unixtime(); 
        settimeofday(&tv, NULL);
    }
    time_t now_check = time(NULL);
    Serial.printf("Dong ho he thong da duoc dat: %s", ctime(&now_check));
    tft.drawString("RTC/Time OK!", 5, 140, 2);
    delay(1000);
}

void draw_face_box(face_t face) {
    tft.drawRect(face.x, face.y, face.width, face.height, TFT_GREEN);
    Serial.printf("Phat hien khuon mat tai: x=%d, y=%d, w=%d, h=%d\n", face.x, face.y, face.width, face.height);
}
//Kết nối Kiosk vào mạng WiFi đã định cấu hình trong config.h.
void setupWiFiAndConfig() {
    tft.fillScreen(TFT_BLACK);
    tft.setTextColor(TFT_WHITE);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("Dang khoi dong...", 120, 120, 2);

    // 1. Load IP Server (Luôn làm việc này đầu tiên)
    preferences.begin("app-config", true);
    String saved_ip = preferences.getString("server_ip", "192.168.1.100");
    preferences.end();
    
    strcpy(server_ip_buffer, saved_ip.c_str());
    wsHost = saved_ip; // Gán luôn, để dù offline vẫn có thông tin

    // 2. Cấu hình WiFiManager
    WiFiManager wm;
    WiFiManagerParameter custom_server_ip("server", "IP May Tinh (Server)", server_ip_buffer, 40);
    wm.addParameter(&custom_server_ip);

    // --- SỬA LỖI: Đặt thời gian chờ (Timeout) ---
    // Nếu sau 60 giây không kết nối được, nó sẽ bỏ qua để chạy Offline
    wm.setConfigPortalTimeout(60); 
    // -------------------------------------------

    tft.drawString("Dang ket noi WiFi...", 120, 100, 2);
    
    // 3. Thử kết nối
    if (!wm.autoConnect("CHAMCONG-KIOSK")) {
        // --- SỬA LỖI: LOGIC OFFLINE ---
        Serial.println("Ket noi WiFi THAT BAI. Chuyen sang che do OFFLINE.");
        tft.fillScreen(TFT_RED);
        tft.setTextColor(TFT_WHITE);
        tft.drawString("Che do OFFLINE", 120, 120, 4);
        delay(2000);
        // KHÔNG ĐƯỢC GỌI ESP.restart() Ở ĐÂY!
        // Cứ để hàm này kết thúc, nó sẽ chạy tiếp xuống loop()
        return; 
        // -------------------------------
    }

    // 4. Nếu Online (Kết nối thành công)
    Serial.println("Ket noi WiFi THANH CONG!");
    
    // Lưu IP mới nếu có thay đổi
    String new_ip = custom_server_ip.getValue();
    if (new_ip != saved_ip && new_ip.length() > 0) {
        preferences.begin("app-config", false);
        preferences.putString("server_ip", new_ip);
        preferences.end();
        wsHost = new_ip;
    }

    tft.fillScreen(TFT_BLACK);
    tft.drawString("WiFi OK!", 120, 60, 4);
    tft.drawString("IP: " + WiFi.localIP().toString(), 120, 100, 2);
    tft.drawString("Server: " + wsHost, 120, 130, 2);
    delay(2000);
}
//Xử lý các sự kiện lõi của WebSocket (kết nối, ngắt kết nối, nhận được tin nhắn).
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    if (type == WStype_CONNECTED) {
        wsConnected = true;
        Serial.println("WS connected");
        wsClient.sendTXT("role:device"); 
        Serial.println("WS: sent role:device");
    } else if (type == WStype_DISCONNECTED) {
        wsConnected = false;
        Serial.println("WS disconnected");
    } else if (type == WStype_TEXT) {
        String msg = String((char*)payload, length);
        handleWsMessage(msg); 
    }
}
//Tin nhắn text từ server WebSocket và xử lý lệnh.
void handleWsMessage(const String &msg) {
    Serial.printf("WS RX: %s\n", msg.c_str());
    if (msg.startsWith("enroll:")) {
    String name = msg.substring(7);
    name.trim();
    if (name.length() > 0) {
        Serial.printf("WS: Nhan lenh enroll cho %s\n", name.c_str());

        EnrollJob* job = (EnrollJob*) malloc(sizeof(EnrollJob));
        if (job == NULL) {
             Serial.println("LOI: Malloc EnrollJob that bai!");
             return;
        }
        memset(job, 0, sizeof(EnrollJob));
        strncpy(job->name, name.c_str(), sizeof(job->name) - 1);
        job->samples = 5;

        gEnrollingInProgress = true;


        xTaskCreatePinnedToCore(
            enrollTask, 
            "enrollTask_temp", 
            36 * 1024,         
            (void*)job,        
            2, 
            NULL,
            1); 

        Serial.println("WS: Da tao tac vu enrollTask_temp");
        wsSendTxt(String("progress:") + name + ":0/" + String(job->samples));
    }
    } else if (msg == "delete_all" || msg == "clear_db") {
        clearRecognitionDatabase();
    } else if (msg == "dump_db" || msg == "dump_faces") {
        dumpRecognitionDatabase();
    }
}
//Tác vụ nền (Core 0), chạy song song, chịu trách nhiệm duy trì kết nối WebSocket, gửi/nhận tin nhắn qua hàng đợi, và gửi "ping" 10s/lần.
static void wsTask(void *pvParameters) {
    Serial.println("wsTask started (Core 0)");
    wsClient.onEvent(webSocketEvent);
    wsClient.begin(wsHost.c_str(), wsPort, "/ws");
    wsClient.setReconnectInterval(5000);
    unsigned long lastSend = 0;
    unsigned long lastHWMCheck = 0;
    for (;;) {
        wsClient.loop(); 
        WSMessage msg;
        if (wsSendQueue != NULL && xQueueReceive(wsSendQueue, &msg, 0) == pdTRUE) {
            if (msg.payload[0] != '\0') {
                Serial.printf("wsTask: Sending: %s\n", msg.payload);
                wsClient.sendTXT(msg.payload);
            }
        }
        if (millis() - lastSend > 10000) {
            if (wsConnected) {
                wsClient.sendTXT("ping");
            }
            lastSend = millis();
        }
        if (millis() - lastHWMCheck > 10000) {
            Serial.println("--- HEAP VA STACK HIGH WATER MARKS ---");
            Serial.printf("HEAP: Con trong %u / Tong %u\n", ESP.getFreeHeap(), ESP.getHeapSize());
            Serial.printf("PSRAM: Con trong %u / Tong %u\n", ESP.getFreePsram(), ESP.getPsramSize());
            if (g_recogTaskHandle) Serial.printf(" - RecogTask HWM (Core 1): %u bytes\n", uxTaskGetStackHighWaterMark(g_recogTaskHandle));
            if (g_enrollTaskHandle) Serial.printf(" - EnrollTask HWM (Core 1): %u bytes\n", uxTaskGetStackHighWaterMark(g_enrollTaskHandle));
            if (g_senderTaskHandle) Serial.printf(" - SenderTask HWM (Core 0): %u bytes\n", uxTaskGetStackHighWaterMark(g_senderTaskHandle));
            if (g_wsTaskHandle) Serial.printf(" - WsTask HWM (Core 0): %u bytes\n", uxTaskGetStackHighWaterMark(g_wsTaskHandle));
            if (g_syncTaskHandle) Serial.printf(" - SyncTask HWM (Core 0): %u bytes\n", uxTaskGetStackHighWaterMark(g_syncTaskHandle));
            Serial.printf(" - LoopTask HWM (Core %d): %u bytes\n", xPortGetCoreID(), uxTaskGetStackHighWaterMark(NULL)); 
            Serial.println("---------------------------------------");
            lastHWMCheck = millis();
        }
        
        vTaskDelay(50 / portTICK_PERIOD_MS); 
    }
}

//Khởi tạo mọi thứ: Màn hình, SPIFFS, SD Card, WiFi, Camera, và các tác vụ nền RTOS.
void setup() {
    delay(3000);
    Serial.begin(115200);
    Serial.println("___FACE DETECTION___");

    tft.init();
    tft.setRotation(3); 
    tft.fillScreen(TFT_BLACK);
    tft.setTextColor(TFT_WHITE);
    tft.drawString("Khoi tao LCD OK!", 5, 5, 2);

    pinMode(WIFI_RESET_BTN, INPUT_PULLUP);


    if (!SPIFFS.begin(true)) { 
        Serial.println("Loi: Khong the mount SPIFFS");
        tft.fillScreen(TFT_RED);
        tft.drawString("SPIFFS Mount FAILED!", 5, 40, 2);
        while(1) delay(1000); 
    }
    tft.drawString("SPIFFS OK!", 5, 40, 2);
    
    Serial.println("Khoi tao SD Card (SD_MMC 1-bit)...");
    
    // Chỉ định 3 chân (CLK, CMD, D0)
    SD_MMC.setPins(39, 38, 40);

    if(!SD_MMC.begin("/sd", true)){ 
        Serial.println("LOI: Khong the khoi tao SD Card! (Kiem tra the nho)");
        tft.drawString("LOI: SD Card", 5, 60, 2);
    } else {
        Serial.println("SD Card OK.");
        tft.drawString("SD Card OK!", 5, 60, 2);
    }

    Serial.println("Khoi tao I2C...");
    Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

    setupWiFiAndConfig();
    setupTime();   
    
    camera.pinout.freenove_s3();
    camera.brownout.disable();
    camera.xclk.slow();
    camera.resolution.face(); 
    camera.quality.best();
    camera.pixformat.rgb565(); 
    detection.fast();
    detection.confidence(0.80);
    recognition.confidence(0.97);

    tft.drawString("Khoi tao Camera...", 5, 80, 2); 
    while (!camera.begin().isOk()){
        Serial.println(camera.exception.toString());
        tft.fillScreen(TFT_RED); 
        tft.drawString("Camera init FAILED!", 5, 40, 2);
        delay(1000);
    }
    camera.sensor.hmirror(true); 
    camera.sensor.vflip(true);   
    
    if (!SPIFFS.exists("/faces")) {
        SPIFFS.mkdir("/faces");
        Serial.println("Da tao thu muc /faces tren SPIFFS.");
    }

    while (!recognition.begin().isOk()) 
        Serial.println(recognition.exception.toString());

    // (Tinh chỉnh cảm biến giữ nguyên)
    camera.sensor.setAutomaticWhiteBalance(true); 
    camera.sensor.setAutomaticGainControl(true);    
    camera.sensor.setExposureControl(true);
    camera.sensor.setBrightness(2);  
    camera.sensor.setSaturation(1);
    
    Serial.println("Camera OK");
    Serial.println("Face recognizer OK");
    
    tft.fillScreen(TFT_BLACK); 
    Serial.println("Awaiting for face...");

    // (Khởi tạo Task/Queue giữ nguyên)
    camAIMutex = xSemaphoreCreateMutex();
    if (camAIMutex == NULL) { Serial.println("Loi: Khong the tao camAIMutex"); }
    
    uploadQueue = xQueueCreate(4, sizeof(UploadJob));
    if (uploadQueue == NULL) { Serial.println("Loi: Khong the tao uploadQueue"); }
    else {
        xTaskCreatePinnedToCore(senderTask, "senderTask", 10 * 1024, NULL, 1, &g_senderTaskHandle, 0);
        Serial.println("senderTask started (Core 0)");
    }


    {
        wsHost = API_HOST; 
        wsPort = API_PORT;
    }

    Serial.printf("WS will connect to %s:%u/ws (wsTask)\n", wsHost.c_str(), wsPort);
    
    wsSendQueue = xQueueCreate(8, sizeof(WSMessage));
    if (wsSendQueue == NULL) { Serial.println("Loi: Khong the tao wsSendQueue"); }
    xTaskCreatePinnedToCore(wsTask, "wsTask", 6 * 1024, NULL, 2, &g_wsTaskHandle, 0);
    
    xTaskCreatePinnedToCore(
        syncTask,          
        "syncTask",         
        10 * 1024,          
        NULL,               
        1,                  
        &g_syncTaskHandle,  
        0                   
    );
    
    xTaskCreatePinnedToCore(recognitionTask, "recognitionTask", 28 * 1024, NULL, 1, &g_recogTaskHandle, 1);
    Serial.println("recognitionTask started (Core 1)");
}
//Tạo chuỗi timestamp theo định dạng YYYYMMDD-HHMMSS
static void make_timestamp(char *buf, size_t buflen) {
    time_t now = time(NULL);
    if (now > 1600000000) {
        struct tm t;
        localtime_r(&now, &t); 
        snprintf(buf, buflen, "%04d%02d%02d-%02d%02d%02d",
            t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
            t.tm_hour, t.tm_min, t.tm_sec);
    } else {
        unsigned long ms = millis();
        snprintf(buf, buflen, "ms%lu", ms);
    }
}
//Làm sạch tên (employee_id) để đảm bảo nó an toàn khi dùng làm tên file.
static void sanitize_name_for_file(const char *in, char *out, size_t outlen) {
    if (!in || !out || outlen == 0) return;
    char tmp[64];
    size_t i = 0, j = 0;
    while (in[i] && isspace((unsigned char)in[i])) i++;
    while (in[i] && j + 1 < sizeof(tmp)) {
        tmp[j++] = in[i++];
    }
    while (j > 0 && isspace((unsigned char)tmp[j-1])) j--;
    tmp[j] = '\0';
    size_t take = j;
    while (take > 0) {
        ssize_t last_dash = -1;
        for (ssize_t p = (ssize_t)take - 1; p >= 0; --p) {
            if (tmp[p] == '-') { last_dash = p; break; }
        }
        if (last_dash == -1) break;
        bool all_digits = true;
        if ((size_t)last_dash + 1 >= take) break;
        for (size_t q = (size_t)last_dash + 1; q < take; ++q) {
            if (!isdigit((unsigned char)tmp[q])) { all_digits = false; break; }
        }
        if (all_digits) { take = (size_t)last_dash; } 
        else { break; }
    }
    size_t outi = 0;
    for (size_t k = 0; k < take && outi + 1 < outlen; ++k) {
        char c = tmp[k];
        if (isspace((unsigned char)c)) c = '_';
        if ( (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_' || c == '-') {
            out[outi++] = c;
        }
    }
    if (outi == 0 && outlen > 1) {
        strncpy(out, "unknown", outlen - 1);
        out[outlen-1] = '\0';
    } else {
        out[outi] = '\0';
    }
}
//Chụp nhiều ảnh, tìm ảnh có khuôn mặt to/rõ nhất, và nén nó thành file JPEG rồi đưa vào hàng đợi uploadQueue (để senderTask xử lý).
static bool capture_best_and_enqueue(const String &employeeId, int attempts = 5, int quality = 80) {
    camera_fb_t *best_fb = NULL;
    size_t best_area = 0;
    uint8_t *best_jpg = NULL;
    size_t best_jpg_len = 0;
    bool best_must_free = false;
    bool result = false;

    Serial.println("[BEST] Dang cho camAIMutex...");
    if (xSemaphoreTake(camAIMutex, pdMS_TO_TICKS(5000)) == pdTRUE) {
    Serial.println("[BEST] Da lay camAIMutex");
    for (int i = 0; i < attempts; ++i) {
        if (!camera.capture().isOk()) {
            Serial.println("capture_best: Chup anh loi");
            continue;
        }
        camera_fb_t *fb = camera.frame;
        if (!fb) continue;
        if (!detection.run().isOk()) {
            Serial.println("capture_best: Phat hien loi");
            continue;
        }
        if (detection.notFound()) {
            Serial.println("capture_best: Khong tim thay khuon mat");
            continue;
        }

        face_t f = detection.first;
        size_t area = (size_t)f.width * (size_t)f.height;
        Serial.printf("capture_best: Frame %d, Dien tich mat=%u\n", i, (unsigned)area);

        if (area > best_area) {
            if (best_must_free && best_jpg) { free(best_jpg); best_jpg = NULL; best_jpg_len = 0; best_must_free = false; }
            if (fb->format == PIXFORMAT_JPEG) {
                best_jpg_len = fb->len;
                best_jpg = (uint8_t*)malloc(best_jpg_len);
                if (best_jpg) {
                    memcpy(best_jpg, fb->buf, best_jpg_len);
                    best_must_free = true;
                    best_area = area;
                }
            } else { 
                uint8_t *jpg_buf = NULL;
                size_t jpg_len = 0;
                if (frame2jpg(fb, quality, &jpg_buf, &jpg_len)) {
                    best_jpg = jpg_buf;
                    best_jpg_len = jpg_len;
                    best_must_free = true;
                    best_area = area;
                } else {
                    if (jpg_buf) free(jpg_buf);
                }
            }
        }
        delay(80);
    }

    if (!best_jpg || best_jpg_len == 0) {
        Serial.println("capture_best: Khong tim thay khung hinh phu hop");
        result = false;
    }

    uint8_t *payload = (uint8_t*)malloc(best_jpg_len);
    if (!payload) {
        Serial.println("capture_best: Loi malloc (het bo nho)");
        if (best_must_free && best_jpg) free(best_jpg);
        xSemaphoreGive(camAIMutex); 
        return false;
    }
    memcpy(payload, best_jpg, best_jpg_len);

    UploadJob job;
    memset(&job, 0, sizeof(job));
    strncpy(job.employee, employeeId.c_str(), sizeof(job.employee) - 1);
    make_timestamp(job.timestamp, sizeof(job.timestamp));
    job.data = payload;
    job.len = best_jpg_len;

    if (uploadQueue == NULL) {
        Serial.println("capture_best: Loi, uploadQueue la NULL");
        free(payload);
        if (best_must_free && best_jpg) free(best_jpg);
        xSemaphoreGive(camAIMutex); 
        return false;
    }

    if (xQueueSend(uploadQueue, &job, 0) != pdTRUE) {
        Serial.println("capture_best: Hang doi upload bi day");
        free(payload);
        if (best_must_free && best_jpg) free(best_jpg);
        xSemaphoreGive(camAIMutex); 
        return false;
    }

    Serial.println("capture_best: Da them anh vao hang doi upload");
    result = true;

    if (best_must_free && best_jpg) free(best_jpg);
    Serial.println("[BEST] Nha camAIMutex");
    xSemaphoreGive(camAIMutex);
    } else {
        Serial.println("capture_best: Loi, khong lay duoc camAIMutex (timeout)");
        result = false;
    }
    return result;
}
//Xử lý khi nhận diện thành công. Nó kiểm tra sự ổn định (thấy cùng 1 người trong X khung hình) trước khi gọi capture_best_and_enqueue để chấm công.
static void handleRecognitionResult(const String &name, float similarity, const face_t &face) {
    if (name.length() == 0 || name == "unknown" || similarity < RECOG_SIMILARITY_THRESHOLD) {
        lastCandidateName = "";
        candidateCount = 0;
        candidateLastSeen = 0;
        return;
    }
    unsigned long now = millis();
    if (name == lastCandidateName && (now - candidateLastSeen) <= CONSISTENT_WINDOW_MS) {
        candidateCount++;
    } else {
        lastCandidateName = name;
        candidateCount = 1;
    }
    candidateLastSeen = now;
    Serial.printf("Phat hien ung vien %s (lan %d), do giong=%.4f\n", name.c_str(), candidateCount, similarity);

    if (candidateCount >= REQUIRED_CONSISTENT_MATCHES) {
        Serial.printf("XAC NHAN %s (khop %d lan), do giong=%.4f\n", name.c_str(), candidateCount, similarity);
        lastRecognitionTime = now; 
        bool ok = capture_best_and_enqueue(name, 6, 85);
        if (!ok) {
            sendAttendanceProof(name); 
        }
        lastCandidateName = "";
        candidateCount = 0;
        candidateLastSeen = 0;
    }
}
//Tác vụ nền (Core 1) được tạo riêng khi có lệnh đăng ký, gọi enrollRoutine để thực hiện, sau đó tự hủy.
static void enrollTask(void *pvParameters) {
    EnrollJob* job = (EnrollJob*) pvParameters;
    if (job == NULL || job->name[0] == '\0') {
        Serial.println("enrollTask: Loi, job bi null.");
        if(job) free(job);
        gEnrollingInProgress = false;
        vTaskDelete(NULL);
        return;
    }

    String sname = String(job->name);
    Serial.printf("enrollTask: Bat dau enroll cho %s (can %d mau)\n", job->name, job->samples);

    gEnrollingInProgress = true; 
    enrollRoutine(sname, job->samples);
    gEnrollingInProgress = false; 

    Serial.printf("enrollTask: Hoan thanh enroll cho %s\n", job->name);

    free(job);
    vTaskDelete(NULL);
}
//Hàm an toàn để gửi tin nhắn text qua wsTask (sử dụng hàng đợi wsSendQueue để tránh xung đột).
static bool wsSendTxt(const String &msg) {
    if (wsSendQueue == NULL) return false;
    WSMessage m;
    memset(&m, 0, sizeof(m));
    strncpy(m.payload, msg.c_str(), sizeof(m.payload) - 1);
    BaseType_t ok = xQueueSend(wsSendQueue, &m, 10 / portTICK_PERIOD_MS);
    return ok == pdTRUE;
}


//Tác vụ nền (Core 0), chạy liên tục. Lấy các ảnh chấm công từ uploadQueue, cố gắng gửi lên server (HTTP POST). Nếu server offline, nó sẽ lưu ảnh vào SD Card.
static void senderTask(void *pvParameters) {
    UploadJob job;
    for (;;) {
        if (xQueueReceive(uploadQueue, &job, portMAX_DELAY) == pdTRUE) {
            job.timestamp[sizeof(job.timestamp)-1] = '\0';
            job.employee[sizeof(job.employee)-1] = '\0';

            char safe_emp[48];
            sanitize_name_for_file(job.employee, safe_emp, sizeof(safe_emp));
            
            char filename[160];
            snprintf(filename, sizeof(filename), "/temp_%s-%s.jpg", safe_emp, job.timestamp);

            fs::File f = SPIFFS.open(filename, "w"); 
            if (!f) {
                Serial.printf("Loi: Khong the mo file %s de luu\n", filename);
            } else {
                size_t written = f.write(job.data, job.len);
                f.close();
                Serial.printf("Da luu file tam: %s (%u bytes)\n", filename, (unsigned)written);
            }

            WiFiClient client;
            const int MAX_RETRIES = 3; 
            int retries = 0;
            bool connected = false;

            while (retries < MAX_RETRIES && !connected) {
                if (client.connect(wsHost.c_str(), wsPort)) {
                    connected = true; 
                } else {
                    retries++;
                    Serial.printf("[senderTask] Ket noi server that bai. Thu lai (%d/%d)...\n", retries, MAX_RETRIES);
                    vTaskDelay(2000 / portTICK_PERIOD_MS); 
                }
            }

            if (!connected) {
                Serial.println("[senderTask] Loi: Khong the ket noi. LUU OFFLINE vao SD Card.");
                
                const char *basename = strrchr(filename, '/');
                if (basename == NULL) { basename = filename; } 
                else { basename = basename + 1; }

                char sd_filename[170];
                snprintf(sd_filename, sizeof(sd_filename), "/%s", basename); 
                
                File f_sd = SD_MMC.open(sd_filename, FILE_WRITE); 
                if (!f_sd) {
                    Serial.printf("LOI: Khong the mo file %s tren SD Card (da mount o /sd)\n", sd_filename);
                } else {
                    f_sd.write(job.data, job.len);
                    f_sd.close();
                    Serial.printf("Da luu file OFFLINE: /sd%s (%u bytes)\n", sd_filename, (unsigned)job.len);

                    File qFile = SD_MMC.open("/offline_queue.txt", FILE_APPEND); 
                    if (qFile) {
                        qFile.printf("%s|%s|%s\n", job.employee, job.timestamp, sd_filename);
                        qFile.close();
                        Serial.println("[senderTask] Da them job vao hang doi SD Card.");
                    } else {
                        Serial.println("LOI: Khong mo duoc file queue.txt tren SD Card!");
                    }
                }
                
                SPIFFS.remove(filename); 
                free(job.data); 
                continue; 
            }

            Serial.printf("[senderTask] Dang POST len host=%s port=%u path=%s\n", wsHost.c_str(), wsPort, "/api/log-attendance");
            
            String boundary = "----ESP32Boundary7MA4YWxk";
            String body_start = "--" + boundary + "\r\n";
            body_start += "Content-Disposition: form-data; name=\"employee_id\"\r\n\r\n";
            body_start += String(job.employee) + "\r\n";

            const char *basename = filename;
            if (basename[0] == '/') basename++;
            String image_header = "--" + boundary + "\r\n";
            image_header += "Content-Disposition: form-data; name=\"image\"; filename=\"" + String(basename) + "\"\r\n";
            image_header += "Content-Type: image/jpeg\r\n\r\n";
            String body_end = "\r\n--" + boundary + "--\r\n";
            size_t totalLen = body_start.length() + image_header.length() + job.len + body_end.length();

            String req = String("POST /api/log-attendance HTTP/1.1\r\n"); 
            req += String("Host: ") + wsHost + ":" + String(wsPort) + "\r\n";
            req += "User-Agent: ESP32-CAM\r\n";
            req += "Connection: close\r\n";
            req += "Content-Type: multipart/form-data; boundary=" + boundary + "\r\n";
            req += "Content-Length: " + String(totalLen) + "\r\n\r\n";

            client.print(req);
            client.print(body_start);
            client.print(image_header);
            client.write(job.data, job.len);
            client.print(body_end);

            unsigned long timeout = millis() + 5000;
            while(!client.available() && millis() < timeout) { delay(10); }
            
            if (client.available()) {
                String status = client.readStringUntil('\n');
                status.trim();
                Serial.println(status);
                while(client.available()) {
                    String line = client.readStringUntil('\n');
                    Serial.println(line);
                }
            } else {
                Serial.println("[senderTask] Loi: Khong nhan duoc phan hoi (timeout)");
            }

            client.stop();
            SPIFFS.remove(filename); 
            free(job.data); 
        }
    }
}

//Vòng lặp vô tận (Core 1), liên tục chụp ảnh, tìm khuôn mặt, và thực hiện nhận diện AI
static void recognitionTask(void *pvParameters) {
    (void) pvParameters;
    for (;;) {
        if (gEnrollingInProgress) {
            vTaskDelay(50 / portTICK_PERIOD_MS);
            continue;
        }
        
        String localName = "";
        float localSim = 0.0f;
        face_t localFace = {0,0,0,0,0};

        Serial.println("[REC] Dang cho camAIMutex...");
        if (xSemaphoreTake(camAIMutex, portMAX_DELAY) == pdTRUE) {
            Serial.println("[REC] Da lay camAIMutex");
            
            if (!camera.capture().isOk()) {
                Serial.println(camera.exception.toString());
                Serial.println("[REC] Nha camAIMutex (Chup anh loi)");
                xSemaphoreGive(camAIMutex);
                vTaskDelay(10 / portTICK_PERIOD_MS);
                continue;
            }
            camera_fb_t* fb = camera.frame;
            if (!fb) {
                Serial.println("Frame buffer bi null");
                Serial.println("[REC] Nha camAIMutex (fb null)");
                xSemaphoreGive(camAIMutex);
                vTaskDelay(10 / portTICK_PERIOD_MS);
                continue;
            }

            // Vẽ ảnh & Sidebar
            tft.pushImage(0, 0, fb->width, fb->height, (uint16_t*)fb->buf);
            tft.fillRect(240, 0, 80, 240, TFT_BLACK); 
            char time_buf[20];
            time_t now = time(NULL);
            if (now > 1600000000) {
                struct tm t;
                localtime_r(&now, &t);
                snprintf(time_buf, sizeof(time_buf), "%02d:%02d:%02d", t.tm_hour, t.tm_min, t.tm_sec);
                tft.setTextColor(TFT_CYAN, TFT_BLACK);
                tft.setCursor(245, 220); 
                tft.setTextSize(1);
                tft.print(time_buf);
            }

            bool faceIsPresent = detection.run().isOk();
            if (!faceIsPresent || detection.notFound()) {
                faceWasPresentInPreviousFrame = false;
                gStableFrames = 0;
                gLastCX = gLastCY = -1;
                tft.setTextColor(TFT_GREEN, TFT_BLACK);
                tft.setCursor(245, 10);
                tft.setTextSize(2);
                tft.print("SCAN");
                Serial.println("[REC] Nha camAIMutex (Khong co mat)");
                xSemaphoreGive(camAIMutex);
                vTaskDelay(10 / portTICK_PERIOD_MS); 
                continue;
            }

            face_t f = detection.first;
            int cx = f.x + f.width / 2;
            int cy = f.y + f.height / 2;
            size_t area = (size_t)f.width * (size_t)f.height;

            if ((int)area < RECOG_MIN_FACE_AREA) {
                tft.drawRect(f.x, f.y, f.width, f.height, TFT_YELLOW);
                gStableFrames = 0;
                gLastCX = cx; gLastCY = cy; gLastArea = area;
                tft.setTextColor(TFT_YELLOW, TFT_BLACK);
                tft.setCursor(245, 10); tft.setTextSize(2); tft.print("SCAN");
                tft.setCursor(245, 40); tft.setTextSize(1); tft.print("Lai gan hon");
                Serial.println("[REC] Nha camAIMutex (Mat qua nho)");
                xSemaphoreGive(camAIMutex);
                vTaskDelay(10 / portTICK_PERIOD_MS);
                continue;
            }

            if (gLastCX < 0) { gStableFrames = 1; } 
            else {
                int dx = abs(cx - gLastCX);
                int dy = abs(cy - gLastCY);
                if (dx <= RECOG_MAX_CENTER_DELTA && dy <= RECOG_MAX_CENTER_DELTA) {
                    gStableFrames++;
                } else {
                    gStableFrames = 1;
                }
            }
            gLastCX = cx; gLastCY = cy; gLastArea = area;
            if (!faceWasPresentInPreviousFrame || gStableFrames < RECOG_STABLE_FRAMES) {
                faceWasPresentInPreviousFrame = true;
                tft.drawRect(f.x, f.y, f.width, f.height, TFT_YELLOW);
                tft.setTextColor(TFT_YELLOW, TFT_BLACK);
                tft.setCursor(245, 10); tft.setTextSize(2); tft.print("SCAN");
                tft.setCursor(245, 40); tft.setTextSize(1); tft.print("Giu yen...");
                Serial.println("[REC] Nha camAIMutex (Dang on dinh)");
                xSemaphoreGive(camAIMutex);
                vTaskDelay(10 / portTICK_PERIOD_MS);
                continue;
            }

            if (millis() - lastRecognitionTime < COOLDOWN_PERIOD) {
                tft.drawRect(f.x, f.y, f.width, f.height, TFT_ORANGE);
                tft.setTextColor(TFT_ORANGE, TFT_BLACK);
                tft.setCursor(245, 10); tft.setTextSize(2); tft.print("WAIT");
                tft.setCursor(245, 40); tft.setTextSize(1); tft.print(lastCandidateName);
                Serial.println("[REC] Nha camAIMutex (Cooldown)");
                xSemaphoreGive(camAIMutex);
                vTaskDelay(10 / portTICK_PERIOD_MS);
                continue;
            }

            unsigned long nowMs = millis();
            if (nowMs - gLastRecognitionAttempt < RECOG_MIN_INTERVAL_MS) {
                tft.drawRect(f.x, f.y, f.width, f.height, TFT_GREEN);
                Serial.println("[REC] Nha camAIMutex (Cho interval)"); 
                xSemaphoreGive(camAIMutex);
                vTaskDelay(10 / portTICK_PERIOD_MS);
                continue;
            }

            Serial.println("[REC] Bat dau recognition.recognize()...");
            if (recognition.recognize().isOk()) {
                localName = recognition.match.name;
                localSim = recognition.match.similarity;
                localFace = f;
                gLastRecognitionAttempt = nowMs;
            } else {
                localName = "";
                localSim = 0.0f;
                localFace = f;
                gLastRecognitionAttempt = nowMs;
            }

            Serial.println("[REC] Nha camAIMutex (Sau khi recognize)");
            xSemaphoreGive(camAIMutex);
        }

        if (localName.length() > 0 && localSim > 0.1f && localName != "unknown") {
            tft.setTextColor(TFT_GREEN, TFT_BLACK);
            tft.setCursor(245, 10); tft.setTextSize(2); tft.print("OK");
            tft.setCursor(245, 40); tft.setTextSize(1); tft.println(localName);
            tft.setCursor(245, 60); tft.print(String(localSim, 2));
            handleRecognitionResult(localName, localSim, localFace);
        } else {
            tft.setTextColor(TFT_RED, TFT_BLACK);
            tft.setCursor(245, 10); tft.setTextSize(2); tft.print("SCAN");
            tft.setCursor(245, 40); tft.setTextSize(1); tft.print("Unknown");
            tft.drawRect(localFace.x, localFace.y, localFace.width, localFace.height, TFT_YELLOW);
        }

        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}
//Hàm dự phòng, nếu capture_best_and_enqueue thất bại, nó sẽ gửi ảnh hiện tại đang có (chất lượng có thể không tốt nhất) vào hàng đợi
void sendAttendanceProof(String employeeId){
    Serial.println("Chuan bi gui bang chung (Du phong)...");
    tft.drawString("Dang luu...", 100,100,2);

    if (camAIMutex == NULL) { Serial.println("sendAttendanceProof: camAIMutex la NULL"); }
    Serial.println("[SEND] Dang cho camAIMutex...");
    if (xSemaphoreTake(camAIMutex, pdMS_TO_TICKS(5000)) != pdTRUE) {
        Serial.println("sendAttendanceProof: Khong lay duoc camAIMutex");
        return;
    }
    Serial.println("[SEND] Da lay camAIMutex");

    camera_fb_t* fb = camera.frame;
    if (!camera.hasFrame() || !fb) {
        Serial.println("Khong co frame de gui!");
        Serial.println("[SEND] Nha camAIMutex (no frame)");
        xSemaphoreGive(camAIMutex);
        return;
    }

    Serial.printf("Da chup anh: %u bytes | format=%d\n", (unsigned)fb->len, (int)fb->format);

    uint8_t * jpg_buf = NULL;
    size_t jpg_len = 0;
    const uint8_t * img_buf = NULL;
    size_t img_len = 0;
    bool must_free = false;

    if (fb->format == PIXFORMAT_JPEG) {
        img_buf = fb->buf;
        img_len = fb->len;
    } else {
        if (frame2jpg(fb, 80, &jpg_buf, &jpg_len)) {
            img_buf = jpg_buf;
            img_len = jpg_len;
            must_free = true;
            Serial.printf("Da chuyen doi RGB->JPEG: %u bytes\n", (unsigned)img_len);
        } else {
            Serial.println("Loi: Khong the chuyen doi sang JPEG");
            if (jpg_buf) free(jpg_buf);
            xSemaphoreGive(camAIMutex); 
            return;
        }
    }

    uint8_t *payload = (uint8_t*)malloc(img_len);
    if (!payload) {
        Serial.println("Loi: Khong du bo nho (malloc)");
        if (must_free && jpg_buf) free(jpg_buf);
        Serial.println("[SEND] Nha camAIMutex (malloc fail)");
        xSemaphoreGive(camAIMutex);
        return;
    }
    memcpy(payload, img_buf, img_len);

    UploadJob job;
    memset(&job, 0, sizeof(job));
    strncpy(job.employee, employeeId.c_str(), sizeof(job.employee) - 1);
    make_timestamp(job.timestamp, sizeof(job.timestamp));
    job.data = payload;
    job.len = img_len;

    if (uploadQueue == NULL) {
        Serial.println("Loi: uploadQueue la NULL");
        free(payload);
        if (must_free && jpg_buf) free(jpg_buf);
        Serial.println("[SEND] Nha camAIMutex (queue missing)");
        xSemaphoreGive(camAIMutex);
        return;
    }

    if (xQueueSend(uploadQueue, &job, 0) != pdTRUE) {
        Serial.println("Loi: Hang doi upload bi day");
        free(payload);
        if (must_free && jpg_buf) free(jpg_buf);
        Serial.println("[SEND] Nha camAIMutex (queue full)");
        xSemaphoreGive(camAIMutex);
        return;
    }

    if (must_free && jpg_buf) free(jpg_buf);

    Serial.println("Anh da duoc dua vao hang doi upload (background)");
    Serial.println("[SEND] Nha camAIMutex (done)");
    xSemaphoreGive(camAIMutex);
    return;
}

//Tác vụ nền (Core 0), 10s/lần, kiểm tra xem có log nào được lưu offline (trên SD Card) không. Nếu có, nó gọi syncOfflineLogs
static void syncTask(void *pvParameters) {
    Serial.println("syncTask started (Core 0)");
    vTaskDelay(30000 / portTICK_PERIOD_MS); 

    for (;;) {
        if (!gEnrollingInProgress) {
            syncOfflineLogs();
        }
        vTaskDelay(10000 / portTICK_PERIOD_MS);
    }
}


//Gửi một file log (đã lưu trên SD) lên server
static bool sendOfflineLog(const char* jobLine) {
    char employee_id[48];
    char timestamp[32];
    char sd_filename[170];

    if (sscanf(jobLine, "%[^|]|%[^|]|%s", employee_id, timestamp, sd_filename) != 3) {
        Serial.printf("[SyncTask] Loi: Dinh dang file queue bi sai: %s\n", jobLine);
        return false; 
    }

    Serial.printf("[SyncTask] Dang xu ly job: %s\n", employee_id);

    File f_sd = SD_MMC.open(sd_filename, FILE_READ); 
    if (!f_sd) {
        Serial.printf("[SyncTask] Loi: Khong mo duoc file %s (da mount o /sd)\n", sd_filename);
        return false; 
    }

    size_t img_len = f_sd.size();
    if (img_len == 0) {
        Serial.println("[SyncTask] Loi: File anh bi rong (0 bytes)");
        f_sd.close();
        return true; 
    }

    uint8_t *img_buf = (uint8_t*)malloc(img_len);
    if (!img_buf) {
        Serial.println("[SyncTask] Loi: Malloc that bai (het PSRAM)");
        f_sd.close();
        return false; 
    }
    f_sd.read(img_buf, img_len);
    f_sd.close();

    WiFiClient client;
    if (!client.connect(wsHost.c_str(), wsPort)) {
        Serial.println("[SyncTask] Loi: Khong ket noi duoc server (bo qua)");
        free(img_buf);
        return false; 
    }

    Serial.printf("[SyncTask] Dang POST file %s len server...\n", sd_filename);
    String boundary = "----ESP32Boundary7MA4YWxk";
    String body_start = "--" + boundary + "\r\n";
    body_start += "Content-Disposition: form-data; name=\"employee_id\"\r\n\r\n";
    body_start += String(employee_id) + "\r\n";

    const char *basename = strrchr(sd_filename, '/');
    if (basename == NULL) { basename = sd_filename; } 
    else { basename = basename + 1; }

    String image_header = "--" + boundary + "\r\n";
    image_header += "Content-Disposition: form-data; name=\"image\"; filename=\"" + String(basename) + "\"\r\n";
    image_header += "Content-Type: image/jpeg\r\n\r\n";
    String body_end = "\r\n--" + boundary + "--\r\n";
    size_t totalLen = body_start.length() + image_header.length() + img_len + body_end.length();

    String req = String("POST /api/log-attendance HTTP/1.1\r\n");
    req += String("Host: ") + wsHost + ":" + String(wsPort) + "\r\n"; //
    req += "User-Agent: ESP32-CAM (OfflineSync)\r\n";
    req += "Connection: close\r\n";
    req += "Content-Type: multipart/form-data; boundary=" + boundary + "\r\n";
    req += "Content-Length: " + String(totalLen) + "\r\n\r\n";

    client.print(req);
    client.print(body_start);
    client.print(image_header);
    client.write(img_buf, img_len);
    client.print(body_end);
    
    free(img_buf); 

    unsigned long timeout = millis() + 5000;
    while(!client.available() && millis() < timeout) { delay(10); }

    if (client.available()) {
        String status = client.readStringUntil('\n');
        status.trim();
        Serial.printf("[SyncTask] Server phan hoi: %s\n", status.c_str());
        client.stop();
        if (status.indexOf("200 OK") != -1) {
            Serial.println("[SyncTask] Gui thanh cong!");
            return true; 
        }
    }
    
    Serial.println("[SyncTask] Loi: Gui file offline that bai (Server 500?).");
    client.stop();
    return false; 
}

//Xóa dòng đầu tiên của file offline_queue.txt (sau khi sendOfflineLog thành công)
static void removeFirstLineFromQueue() {
    File qFile = SD_MMC.open("/offline_queue.txt", FILE_READ); 
    File tempFile = SD_MMC.open("/offline_queue.tmp", FILE_WRITE); 

    if (!qFile || !tempFile) {
        Serial.println("[SyncTask] Loi: Khong mo duoc file queue de xoa dong.");
        if(qFile) qFile.close();
        if(tempFile) tempFile.close();
        return;
    }

    qFile.readStringUntil('\n');

    char buf[128];
    while(qFile.available()) {
        size_t len = qFile.readBytes(buf, sizeof(buf));
        tempFile.write((const uint8_t*)buf, len);
    }
    qFile.close();
    tempFile.close();

    SD_MMC.remove("/offline_queue.txt");
    SD_MMC.rename("/offline_queue.tmp", "/offline_queue.txt");    
    Serial.println("[SyncTask] Da xoa job hoan thanh khoi queue.");
}

//đồng bộ offline. Nó đọc 1 dòng từ queue, gọi sendOfflineLog, và nếu thành công, gọi removeFirstLineFromQueue
void syncOfflineLogs() {
    if (WiFi.status() != WL_CONNECTED) {
        return; 
    }

    File qFile = SD_MMC.open("/offline_queue.txt", FILE_READ); 
    if (!qFile || qFile.size() == 0) {
        if(qFile) qFile.close();
        return; 
    }

    String line = qFile.readStringUntil('\n');
    qFile.close();
    line.trim();
    if(line.length() == 0) return;

    Serial.println("[SyncTask] Phat hien log offline, bat dau dong bo...");

    if (sendOfflineLog(line.c_str())) {
        char sd_filename[170];
        if (sscanf(line.c_str(), "%*[^|]|%*[^|]|%s", sd_filename) == 1) {
            SD_MMC.remove(sd_filename);
            Serial.printf("[SyncTask] Da xoa file: /sd%s\n", sd_filename);
        }
        removeFirstLineFromQueue();
    }
}

/**
 * @brief Vòng lặp chính (Core 1), giờ không làm gì
 */
void loop() {
    if (digitalRead(WIFI_RESET_BTN) == LOW) {
        if (!btnPressed) {
            btnPressed = true;
            btnPressStart = millis();
        }
        
        // Nếu nhấn giữ > 3 giây
        if (millis() - btnPressStart > 3000) {
            tft.fillScreen(TFT_RED);
            tft.setTextColor(TFT_WHITE);
            tft.setTextDatum(MC_DATUM);
            tft.drawString("RESET CAI DAT...", 120, 120, 4);
            
            Serial.println("Dang xoa WiFi va IP...");
            
            WiFiManager wm;
            wm.resetSettings(); // Xóa thông tin WiFi đã lưu
            
            // Xóa luôn IP server
            preferences.begin("app-config", false);
            preferences.clear();
            preferences.end();
            
            delay(1000);
            ESP.restart(); // Khởi động lại vào chế độ Cấu hình
        }
    } else {
        btnPressed = false;
    }

    vTaskDelay(100 / portTICK_PERIOD_MS);
}

//Xóa toàn bộ CSDL khuôn mặt (cả trong RAM lẫn các file .json trên SPIFFS).
static void clearRecognitionDatabase() {
    Serial.println("[DB] Dang xoa CSDL khuon mat...");
    bool prevPause = gEnrollingInProgress;
    gEnrollingInProgress = true;
    vTaskDelay(50 / portTICK_PERIOD_MS);

    Serial.println("[DB] Dang cho camAIMutex...");
    if (camAIMutex && xSemaphoreTake(camAIMutex, portMAX_DELAY) == pdTRUE) {
        Serial.println("[DB] Da lay camAIMutex.");

        recognition.deleteAll();
        Serial.println("[DB] Da xoa RAM list.");

        Serial.println("[DB] Dang xoa file vinh vien trong SPIFFS...");
        // SỬA 2: Khai báo fs::File (cho SPIFFS, đã mount ở /)
        fs::File root = SPIFFS.open("/faces"); 
        if (root && root.isDirectory()) {
            fs::File file = root.openNextFile(); 
            int deleted_count = 0;
            while (file) {
                if (!file.isDirectory()) {
                    // SỬA 3: file.name() chỉ trả về tên file (NV001.json)
                    String filepath = "/faces/";
                    filepath += file.name();
                    
                    if (filepath.endsWith(".json")) {
                        Serial.printf("[DB] Dang xoa: %s\n", filepath.c_str());
                        if (SPIFFS.remove(filepath)) {
                            Serial.println("[DB] -> Xoa thanh cong.");
                            deleted_count++;
                        } else {
                            Serial.println("[DB] -> LOI: Xoa file that bai!");
                        }
                    }
                }
                file = root.openNextFile();
            }
            root.close();
            Serial.printf("[DB] Da xoa %d file enrollment.\n", deleted_count);
        } else {
            Serial.println("[DB] Khong mo duoc thu muc /faces");
        }

        Serial.println("[DB] Dang tai lai recognition engine (de xoa RAM)...");
        if (!recognition.begin().isOk()) {
            Serial.println("[DB] LOI: Khong the khoi dong lai recognition engine!");
            ESP.restart(); 
        } else {
            Serial.println("[DB] Recognition engine da duoc tai lai (trong).");
        }

        lastCandidateName = "";
        candidateCount = 0;
        candidateLastSeen = 0;

        Serial.println("[DB] Nha camAIMutex.");
        xSemaphoreGive(camAIMutex);
    } else {
        Serial.println("[DB] LOI: Khong lay duoc camAIMutex!");
    }

    tft.fillScreen(TFT_BLACK);
    tft.drawString("Database cleared", 5, 5, 2);
    wsSendTxt("db_cleared");
    Serial.println("[DB] Database da xoa (RAM + SPIFFS).");

    Serial.println("Dang khoi dong lai Kiosk...");
    delay(1000);
    ESP.restart();

    gEnrollingInProgress = prevPause;
}

//DEBUG: In danh sách các khuôn mặt đã đăng ký ra cổng Serial.
static void dumpRecognitionDatabase() {
    Serial.println("[DB] Dang dump CSDL khuon mat...");
    bool prevPause = gEnrollingInProgress;
    gEnrollingInProgress = true;
    vTaskDelay(20 / portTICK_PERIOD_MS);

    bool took = false;
    if (camAIMutex && xSemaphoreTake(camAIMutex, pdMS_TO_TICKS(2000)) == pdTRUE) {
        took = true;
    }
    recognition.dump(); 
    if (took) xSemaphoreGive(camAIMutex);

    tft.fillScreen(TFT_BLACK);
    tft.drawString("Dump faces -> Serial", 5, 5, 2);
    wsSendTxt("db_dumped");
    Serial.println("[DB] Dump hoan tat (Kiem tra Serial log)");

    gEnrollingInProgress = prevPause;
}


/**
 * @brief (THIẾU) Thông báo cho Backend biết việc Enroll đã thành công/thất bại
 */
static void notifyEnrollStatusToApi(String employeeId, bool enrollStatus) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[API] Khong co mang, khong the cap nhat trang thai enroll.");
        return;
    }
    
    HTTPClient http;
    // (Tạm thời comment out, vì chúng ta chưa tạo API /api/users/enroll-status)
    
    String apiUrl = "http://" + wsHost + ":" + String(wsPort) + "/api/users/enroll-status";
    http.begin(apiUrl);
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\"employee_id\":\"" + employeeId + "\", \"is_enrolled\":" + (enrollStatus ? "true" : "false") + "}";
    Serial.printf("[API] Dang PUT trang thai enroll: %s\n", jsonPayload.c_str());
    
    int httpCode = http.PUT(jsonPayload); 
    
    if (httpCode > 0) {
        String payload = http.getString();
        Serial.printf("[API] Phan hoi: %d - %s\n", httpCode, payload.c_str());
    } else {
        Serial.printf("[API] Loi PUT, ma loi: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
    
   Serial.println("[API] (Chua lam) Gui trang thai enroll toi server.");
}


//Quy trình chi tiết của việc đăng ký: Yêu cầu người dùng giữ yên, chụp N tấm ảnh mẫu (samples), và lưu chúng vào CSDL
static void enrollRoutine(const String &name, int samples) {
    Serial.printf("Bat dau quy trinh enroll cho %s (%d mau)\n", name.c_str(), samples);
    const size_t MIN_FACE_AREA = 1500; 
    const uint32_t WAIT_FACE_TIMEOUT_MS = 15000; 
    const int STABLE_FRAMES = 3; 

    int successes = 0;
    int required = max(1, (samples * 70 + 99) / 100); 

    tft.fillScreen(TFT_BLACK);
    tft.setTextColor(TFT_WHITE);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("Enroll:", 120, 100, 4); // In chữ to
    tft.drawString(name, 120, 140, 4);
    bool took = false;
    Serial.println("[ENR] Dang cho camAIMutex...");
    if (xSemaphoreTake(camAIMutex, pdMS_TO_TICKS(10000)) == pdTRUE) {
        took = true;
        Serial.println("[ENR] Da lay camAIMutex");
        
        Serial.println("[ENR] Priming camera...");
        camera.capture(); 
        vTaskDelay(20 / portTICK_PERIOD_MS);
        
        for (int s = 0; s < samples; ) {
            uint32_t start = millis();
            int stable = 0;
            bool gotFace = false;
            face_t f = {0,0,0,0,0};

           while (millis() - start < WAIT_FACE_TIMEOUT_MS) {
                if (!camera.capture().isOk()) {
                    Serial.println("enroll: Chup anh loi");
                    delay(80);
                    continue; 
                }

                camera_fb_t* fb = camera.frame;
                if (fb && fb->buf && fb->width > 0 && fb->height > 0) {
                    tft.pushImage(0, 0, fb->width, fb->height, (uint16_t*)fb->buf);
                    tft.fillRect(240, 0, 80, 240, TFT_BLACK); 
                    tft.setTextColor(TFT_CYAN, TFT_BLACK);
                    tft.setCursor(245, 10); tft.setTextSize(2); tft.print("ENROLL");
                    tft.setCursor(245, 40); tft.setTextSize(1); tft.println(name);
                    tft.setCursor(245, 80); tft.print("Mau:");
                    tft.setCursor(245, 90); tft.setTextSize(2); tft.print(String(s + 1) + "/" + String(samples));
                } else {
                    delay(80);
                    continue; 
                }

                if (!detection.run().isOk() || detection.notFound()) {
                    stable = 0;
                    delay(80); 
                    continue; 
                }

                f = detection.first;
                size_t area = (size_t)f.width * (size_t)f.height;
                
                if (area < MIN_FACE_AREA) {
                    stable = 0;
                    tft.drawRect(f.x, f.y, f.width, f.height, TFT_YELLOW); 
                    delay(80); 
                    continue; 
                }

                tft.drawRect(f.x, f.y, f.width, f.height, TFT_GREEN);
                stable++;
                if (stable >= STABLE_FRAMES) {
                    gotFace = true;
                    break; 
                }
                delay(80); 
            } 

            if (!gotFace) {
                Serial.println("enroll: Timeout, khong thay mat on dinh. Thu lai.");
                continue;
            }

            String nameTrunc = name;
            if (nameTrunc.length() > 16) {
                Serial.printf("[ENR] Ten qua dai (%d), cat con 16 ky tu\n", nameTrunc.length());
                nameTrunc = nameTrunc.substring(0, 16);
            }
            if (recognition.enroll(nameTrunc).isOk()) {
                successes++;
                s++; 
                Serial.printf("enroll: Mau OK (%d/%d)\n", successes, samples);
            } else {
                Serial.print("enroll: Loi, mau hien tai khong enroll duoc: ");
                Serial.println(recognition.exception.toString());
            }

            String prog = String("progress:") + name + ":" + String(successes) + "/" + String(samples);
            wsSendTxt(prog);

            vTaskDelay(350 / portTICK_PERIOD_MS); 
        } 
    } else {
        Serial.println("enrollRoutine: Khong lay duoc camAIMutex (timeout)");
        tft.drawString("Loi: Camera dang ban!", 5, 60, 2);
    }

    if (took) {
        Serial.println("[ENR] Nha camAIMutex");
        xSemaphoreGive(camAIMutex);
    }

    bool enrollSuccess = (successes >= required);

    if (enrollSuccess) {
        Serial.printf("Enroll hoan tat: %d/%d (yeu cau %d)\n", successes, samples, required);
        tft.setTextDatum(MC_DATUM);
        int centerX = tft.width() / 2;
        tft.setTextColor(TFT_GREEN, TFT_BLACK);
        tft.drawString("Enroll thanh cong", centerX, 60, 2);
    } else {
        Serial.printf("Enroll that bai: %d/%d (yeu cau %d)\n", successes, samples, required);
        tft.setTextDatum(MC_DATUM);
        int centerX = tft.width() / 2;
        
        tft.setTextColor(TFT_RED, TFT_BLACK);
        tft.drawString("Enroll that bai", centerX, 60, 2);
    }

    notifyEnrollStatusToApi(name, enrollSuccess);

    String doneMsg = String("enroll_done:") + name + ":" + String(successes) + "/" + String(samples);
    wsSendTxt(doneMsg);
    
    delay(1000);
    tft.fillScreen(TFT_BLACK);
}