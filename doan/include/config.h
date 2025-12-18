#pragma once

// --- Cấu hình Mạng ---
#define WIFI_SSID       "Cafe Goc"
#define WIFI_PASSWORD   "20252026"

#define API_HOST        "192.168.1.119" 
#define API_PORT        5000

// --- Cấu hình Thời gian & I2C ---
#define NTP_SERVER         "pool.ntp.org"
#define GMT_OFFSET_SEC     (3600 * 7)
#define DAYLIGHT_OFFSET_SEC 0

#define I2C_SDA_PIN 47
#define I2C_SCL_PIN 21