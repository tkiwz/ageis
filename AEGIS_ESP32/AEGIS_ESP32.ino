// ======================================================
//   AEGIS Vehicle Monitor Node — ESP32
//   نظام مراقبة المركبة المتصل بـ AEGIS HSSE
//
//   المكونات:
//     BMP085  — درجة الحرارة والضغط الجوي
//     MPU6050 — مقياس التسارع (كشف الاصطدام)
//     INA219  — قياس الجهد والتيار
//     MQ-2    — حساس الغاز (GPIO 36 — ADC1)
//     WS2811  — مؤشر LED
//     Buzzer  — إنذار صوتي
//
//   يُرسل البيانات إلى AEGIS كل 10 ثوانٍ.
//   عند كشف اصطدام: إرسال تنبيه فوري ثم استمرار العمل.
// ======================================================

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_BMP085.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_INA219.h>
#include <FastLED.h>

// ─────────────────────────────────────────────────────
//  إعدادات الشبكة والسيرفر
// ─────────────────────────────────────────────────────
const char* WIFI_SSID      = "Turki";
const char* WIFI_PASS      = "11111111";
const char* AEGIS_ENDPOINT = "https://172.20.10.3:3000/api/data";
const char* DEVICE_CODE    = "VEH-001";   // كود المركبة — غيّره لكل وحدة
const char* SITE_CODE      = "SITE-A";    // كود الموقع
// اجعله نفس DEVICE_INGEST_SECRET في ملف .env — اتركه فارغاً في بيئة التطوير
const char* DEVICE_KEY     = "Ag9xK3mP7nQ2vL8wR4bY6cZ1tJ5hD0";

// ─────────────────────────────────────────────────────
//  الأطراف (Pins)
// ─────────────────────────────────────────────────────
#define PIN_BUZZER   23
#define PIN_GAS      36   // ADC1 — آمن مع WiFi
#define LED_PIN      12
#define NUM_LEDS     1
#define LED_TYPE     WS2811
#define COLOR_ORDER  GRB
#define BRIGHTNESS   200

// ─────────────────────────────────────────────────────
//  حدود الإنذار
// ─────────────────────────────────────────────────────
#define CRASH_THRESHOLD   35.0   // m/s² ≈ 3.5G — حد الاصطدام
#define CRASH_COOLDOWN    10000  // ms — فترة الهدوء بين إنذارات الاصطدام
#define TEMP_CRITICAL     40     // °C — حرارة خطرة
#define TEMP_WARNING      35     // °C — حرارة تحذير
#define GAS_THRESHOLD     50     // % — حد إنذار الغاز
#define SEND_INTERVAL     10000  // ms — فترة إرسال البيانات العادية

// ─────────────────────────────────────────────────────
//  الكائنات العامة
// ─────────────────────────────────────────────────────
Adafruit_BMP085 bmp;
Adafruit_MPU6050 mpu;
Adafruit_INA219  ina219;
CRGB leds[NUM_LEDS];

// ─────────────────────────────────────────────────────
//  متغيرات عامة
// ─────────────────────────────────────────────────────
unsigned long lastSendTime   = 0;
unsigned long lastCrashTime  = 0;
bool          crashDetected  = false;

// قراءات الحساسات — مشتركة بين loop() والإرسال
float g_temperature  = 0;
float g_pressure     = 0;
float g_acceleration = 0;
int   g_gasVal       = 0;
float g_voltage      = 0;
float g_current_mA   = 0;
float g_power_mW     = 0;

// ──────────────────────────────────────────────────────
//  SETUP
// ──────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== AEGIS Vehicle Monitor Booting ===");

  // Buzzer — إشارة بدء
  pinMode(PIN_BUZZER, OUTPUT);
  beepShort(2);

  // LED
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(BRIGHTNESS);
  setLED(CRGB::Blue);

  // BMP085
  if (!bmp.begin()) {
    Serial.println("[ERROR] BMP085 not found — check wiring (I2C)");
  } else {
    Serial.println("[OK] BMP085 ready");
  }

  // MPU6050
  if (!mpu.begin()) {
    Serial.println("[ERROR] MPU6050 not found — check wiring (I2C)");
  } else {
    mpu.setAccelerometerRange(MPU6050_RANGE_16_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println("[OK] MPU6050 ready — range: ±16G");
  }

  // INA219
  if (!ina219.begin()) {
    Serial.println("[ERROR] INA219 not found — check wiring (I2C)");
  } else {
    Serial.println("[OK] INA219 ready");
  }

  // ADC — تحسين دقة قراءة الغاز
  analogSetAttenuation(ADC_11db);   // مدى 0–3.9V على ADC1

  // WiFi
  connectWiFi();

  setLED(CRGB::Green);
  Serial.println("=== System Ready ===\n");
}

// ──────────────────────────────────────────────────────
//  LOOP
// ──────────────────────────────────────────────────────
void loop() {

  // 1) قراءة جميع الحساسات
  readAllSensors();

  // 2) كشف الاصطدام — الأولوية القصوى
  if (g_acceleration > CRASH_THRESHOLD) {
    unsigned long now = millis();
    if (now - lastCrashTime > CRASH_COOLDOWN) {
      lastCrashTime = now;
      handleCrash();
    }
  }

  // 3) منطق LED والإنذار الصوتي
  updateStatusIndicators();

  // 4) إرسال البيانات للسيرفر كل SEND_INTERVAL
  if (millis() - lastSendTime > SEND_INTERVAL) {
    lastSendTime = millis();
    ensureWiFi();
    sendToAEGIS("NORMAL");
  }

  delay(100);
}

// ──────────────────────────────────────────────────────
//  قراءة الحساسات — تُحدَّث المتغيرات العامة
// ──────────────────────────────────────────────────────
void readAllSensors() {
  // غاز MQ-2 (0–100%)
  int raw = analogRead(PIN_GAS);
  g_gasVal = map(raw, 0, 4095, 0, 100);

  // BMP085
  g_temperature = bmp.readTemperature();   // °C
  g_pressure    = bmp.readPressure();      // Pa

  // MPU6050 — تسارع كلي
  sensors_event_t a, gyro, temp;
  mpu.getEvent(&a, &gyro, &temp);
  g_acceleration = sqrt(
    sq(a.acceleration.x) +
    sq(a.acceleration.y) +
    sq(a.acceleration.z)
  );

  // INA219
  float busV    = ina219.getBusVoltage_V();
  float shuntMV = ina219.getShuntVoltage_mV();
  g_voltage    = busV + (shuntMV / 1000.0);
  g_current_mA = ina219.getCurrent_mA();
  g_power_mW   = g_voltage * g_current_mA;
}

// ──────────────────────────────────────────────────────
//  مؤشرات الحالة — LED + Buzzer
// ──────────────────────────────────────────────────────
void updateStatusIndicators() {
  bool alarm = false;

  if ((int)g_temperature >= TEMP_CRITICAL) {
    setLED(CRGB::Red);
    alarm = true;
  } else if ((int)g_temperature >= TEMP_WARNING) {
    setLED(CRGB::Yellow);
  } else if (g_gasVal > GAS_THRESHOLD) {
    setLED(CRGB::Orange);
    alarm = true;
  } else {
    setLED(CRGB::Green);
  }

  if (alarm) {
    beepShort(1);
  }
}

// ──────────────────────────────────────────────────────
//  معالجة الاصطدام — إرسال فوري ثم استمرار
// ──────────────────────────────────────────────────────
void handleCrash() {
  Serial.println("\n!!! CRASH DETECTED !!!");
  Serial.print("Force: "); Serial.print(g_acceleration); Serial.println(" m/s²");

  // إنذار بصري وصوتي مكثف
  for (int i = 0; i < 5; i++) {
    setLED(CRGB::Red);
    digitalWrite(PIN_BUZZER, HIGH);
    delay(150);
    setLED(CRGB::Black);
    digitalWrite(PIN_BUZZER, LOW);
    delay(150);
  }

  // إرسال تنبيه اصطدام فوري
  ensureWiFi();
  sendToAEGIS("CRASH");

  Serial.println("Crash alert sent. Resuming normal operation.\n");
  // لا نوقف النظام — نستمر في المراقبة
}

// ──────────────────────────────────────────────────────
//  إرسال البيانات إلى AEGIS
// ──────────────────────────────────────────────────────
void sendToAEGIS(const char* eventType) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[SEND] WiFi not connected — skipping");
    return;
  }

  HTTPClient http;
  http.begin(AEGIS_ENDPOINT);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  if (strlen(DEVICE_KEY) > 0) {
    http.addHeader("X-Device-Key", DEVICE_KEY);
  }

  // بناء payload
  String payload = "{";
  payload += "\"deviceCode\":\"" + String(DEVICE_CODE) + "\",";
  payload += "\"siteCode\":\""   + String(SITE_CODE)   + "\",";
  payload += "\"eventType\":\""  + String(eventType)   + "\",";
  payload += "\"gas\":"          + String(g_gasVal)    + ",";
  payload += "\"temperature\":"  + String(g_temperature, 1) + ",";
  payload += "\"pressure\":"     + String(g_pressure, 0)    + ",";
  payload += "\"acceleration\":" + String(g_acceleration, 2) + ",";
  payload += "\"voltage\":"      + String(g_voltage, 2)     + ",";
  payload += "\"current_mA\":"   + String(g_current_mA, 1)  + ",";
  payload += "\"power_mW\":"     + String(g_power_mW, 1)    + ",";
  payload += "\"uptime_s\":"     + String(millis() / 1000);
  payload += "}";

  Serial.print("[SEND] " + String(eventType) + " → ");
  Serial.println(payload);

  int code = http.POST(payload);

  if (code > 0) {
    Serial.print("[SEND] Response: "); Serial.println(code);
  } else {
    Serial.print("[SEND] Error: "); Serial.println(http.errorToString(code));
  }

  http.end();
}

// ──────────────────────────────────────────────────────
//  إدارة WiFi
// ──────────────────────────────────────────────────────
void connectWiFi() {
  Serial.print("[WiFi] Connecting to " + String(WIFI_SSID));
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(500);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected — IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] Failed to connect — will retry later");
  }
}

void ensureWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Reconnecting...");
    WiFi.disconnect();
    connectWiFi();
  }
}

// ──────────────────────────────────────────────────────
//  مساعد LED والبزر
// ──────────────────────────────────────────────────────
void setLED(CRGB color) {
  for (int i = 0; i < NUM_LEDS; i++) leds[i] = color;
  FastLED.show();
}

void beepShort(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(80);
    digitalWrite(PIN_BUZZER, LOW);
    if (times > 1) delay(80);
  }
}
