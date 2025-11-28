#pragma once // Đảm bảo file này chỉ được import 1 lần

// --- Cấu hình Mạng ---
// (Đây là nơi duy nhất bạn cần sửa khi đổi WiFi hoặc IP)
#define WIFI_SSID       "KHANH HUNG VNPT"
#define WIFI_PASSWORD   "0978395904"

#define API_HOST        "192.168.88.119" // (IP của máy tính chạy server)
#define API_PORT        5000

// --- Cấu hình Thời gian & I2C ---
#define NTP_SERVER         "pool.ntp.org"
#define GMT_OFFSET_SEC     (3600 * 7)
#define DAYLIGHT_OFFSET_SEC 0

#define I2C_SDA_PIN 47
#define I2C_SCL_PIN 21