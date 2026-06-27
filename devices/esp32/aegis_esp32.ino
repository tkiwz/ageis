/**
 * AEGIS HSSE Platform — ESP32 Sensor Node
 * ==========================================
 * يرسل البيانات إلى: POST http://<SERVER_IP>:3000/api/devices/esp32/ingest
 *
 * المستشعرات المدعومة:
 *   - DHT22/DHT11     : درجة الحرارة والرطوبة
 *   - MQ-2/MQ-135     : مستوى الغاز (ppm)
 *   - KY-026 / IR     : كاشف الشعلة
 *   - MAX30100/AD8232  : تردد القلب (اختياري)
 *
 * المكتبات المطلوبة (في Arduino Library Manager):
 *   - WiFi (built-in ESP32)
 *   - HTTPClient (built-in ESP32)
 *   - ArduinoJson (بنسخة 6.x)
 *   - DHT sensor library (Adafruit)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// ─── إعدادات Wi-Fi ──────────────────────────────────────────
const char* WIFI_SSID     = "Turki";         // ← اكتب اسم الشبكة
const char* WIFI_PASSWORD = "11111111";     // ← اكتب كلمة المرور

// ─── إعدادات AEGIS Server ──────────────────────────────────
const char* SERVER_IP     = "192.168.1.100";          // ← IP سيرفر AEGIS على الشبكة
const int   SERVER_PORT   = 3000;
const char* DEVICE_CODE   = "ESP32-001";              // ← رمز فريد لهذا الجهاز
const char* SITE_CODE     = "SITE-A";                 // ← رمز الموقع (اتركه "" إذا لا يوجد)
const char* DEVICE_SECRET = "";                       // ← قيمة DEVICE_INGEST_SECRET من .env

// ─── أرقام الـ Pins ─────────────────────────────────────────
#define DHT_PIN        4    // DHT22 — درجة الحرارة والرطوبة
#define DHT_TYPE       DHT22
#define GAS_PIN        34   // MQ-2 — Analog pin (GPIO34 = ADC1_6)
#define FLAME_PIN      35   // KY-026 — Digital output (LOW عند وجود شعلة)
#define BATT_PIN       32   // Voltage divider للبطارية (اختياري)
#define LED_STATUS     2    // LED مدمج في معظم لوحات ESP32

// ─── إعدادات التوقيت ────────────────────────────────────────
const unsigned long SEND_INTERVAL_MS = 10000;  // إرسال كل 10 ثوانٍ

// ─── عتبات التنبيه ──────────────────────────────────────────
const float GAS_ADC_WARNING  = 2000.0;  // قيمة ADC (0-4095) → 50 ppm تقريباً
const float GAS_ADC_CRITICAL = 3000.0;  // → 100 ppm تقريباً

// ─── تحويل ADC إلى ppm (تقريبي لـ MQ-2) ────────────────────
// هذه المعادلة تقريبية — يجب معايرة الحساس مع قياس مرجعي
float adcToPpm(int adc) {
  // ADC 0-4095 → 0-5V على 3.3V reference
  float voltage = adc * (3.3f / 4095.0f);
  // تحويل بسيط خطي (عدّل المعاملات حسب datasheet الحساس)
  return voltage * 200.0f;
}

// ─── كائنات المكتبات ─────────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);

unsigned long lastSendTime = 0;

// ════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== AEGIS ESP32 Sensor Node ===");

  // إعداد الـ Pins
  pinMode(FLAME_PIN, INPUT);
  pinMode(LED_STATUS, OUTPUT);
  digitalWrite(LED_STATUS, LOW);

  // تهيئة DHT
  dht.begin();

  // الاتصال بـ Wi-Fi
  connectWiFi();
}

// ════════════════════════════════════════════════════════════
void loop() {
  // إعادة الاتصال إذا انقطع Wi-Fi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] مقطوع — إعادة الاتصال...");
    connectWiFi();
    return;
  }

  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;
    readAndSend();
  }
}

// ════════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.printf("[WiFi] الاتصال بـ %s ...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.printf("[WiFi] ✓ متصل — IP: %s\n", WiFi.localIP().toString().c_str());
    digitalWrite(LED_STATUS, HIGH);
  } else {
    Serial.println("\n[WiFi] ✗ فشل الاتصال");
    digitalWrite(LED_STATUS, LOW);
  }
}

// ════════════════════════════════════════════════════════════
void readAndSend() {
  // --- قراءة الحساسات ---
  float temperature = dht.readTemperature();   // °C
  float humidity    = dht.readHumidity();      // %

  int   gasADC       = analogRead(GAS_PIN);    // 0-4095
  float gasLevel     = adcToPpm(gasADC);

  bool  flameDetected = (digitalRead(FLAME_PIN) == LOW);  // LOW = شعلة مكتشفة

  // قراءة البطارية (اختياري — حذف إذا لم يكن هناك مقسّم جهد)
  int   battADC      = analogRead(BATT_PIN);
  int   battPercent  = map(battADC, 2000, 3700, 0, 100);  // 3.0V→0%, 4.2V→100%
  battPercent = constrain(battPercent, 0, 100);

  // فحص صحة قراءة DHT
  if (isnan(temperature)) {
    Serial.println("[DHT] خطأ في القراءة — إعادة المحاولة لاحقاً");
    temperature = -999;
  }

  // --- طباعة للـ Serial Monitor ---
  Serial.println("\n── قراءة جديدة ──────────────────");
  Serial.printf("  درجة الحرارة : %.1f °C\n",   temperature);
  Serial.printf("  الرطوبة      : %.1f %%\n",    humidity);
  Serial.printf("  الغاز (ADC)  : %d → %.1f ppm\n", gasADC, gasLevel);
  Serial.printf("  الشعلة       : %s\n",          flameDetected ? "🔥 مكتشفة!" : "لا شيء");
  Serial.printf("  البطارية     : %d %%\n",       battPercent);

  // --- بناء JSON ---
  StaticJsonDocument<256> doc;
  doc["deviceCode"]    = DEVICE_CODE;
  doc["temperature"]   = round(temperature * 10.0) / 10.0;  // دقة عشرية واحدة
  doc["gasLevel"]      = round(gasLevel * 10.0) / 10.0;
  doc["flameDetected"] = flameDetected;
  doc["batteryPercent"]= battPercent;

  if (strlen(SITE_CODE) > 0) {
    doc["siteCode"] = SITE_CODE;
  }

  String payload;
  serializeJson(doc, payload);

  // --- HTTP POST ---
  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/devices/esp32/ingest";
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  if (strlen(DEVICE_SECRET) > 0) {
    http.addHeader("X-Device-Secret", DEVICE_SECRET);
  }

  Serial.printf("[HTTP] POST %s\n", url.c_str());
  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP] ✓ كود: %d | رد: %s\n", httpCode, response.c_str());

    // وميض LED إذا نجح الإرسال
    digitalWrite(LED_STATUS, LOW);
    delay(100);
    digitalWrite(LED_STATUS, HIGH);
  } else {
    Serial.printf("[HTTP] ✗ خطأ: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}
