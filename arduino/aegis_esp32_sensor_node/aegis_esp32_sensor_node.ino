/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          AEGIS ESP32 Sensor Node — Firmware v2.0            ║
 * ║                                                              ║
 * ║  الحساسات الأربعة:                                           ║
 * ║    1. MQ-2       حساس الغاز         (Flying-fish, analog)   ║
 * ║    2. DS18B20    درجة الحرارة        (OneWire, screw module) ║
 * ║    3. IR Flame   كاشف اللهب          (digital, active-LOW)  ║
 * ║    4. Pulse      مقياس التردد/النبض  (analog, GPIO 36)      ║
 * ║                                                              ║
 * ║  المكتبات المطلوبة (Arduino Library Manager):                ║
 * ║    - OneWire           by Paul Stoffregen                    ║
 * ║    - DallasTemperature by Miles Burton                       ║
 * ║    - ArduinoJson       by Benoît Blanchon  (v6.x)           ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ════════════════════════════════════════════════════
// ⚙️  الإعدادات — عدّل هنا قبل الرفع
// ════════════════════════════════════════════════════

const char* WIFI_SSID      = "Turki";
const char* WIFI_PASS      = "11111111";
const char* AEGIS_ENDPOINT = "http://172.20.10.2:3000/api/data";

const char* DEVICE_CODE = "ESP32-001";
// IP السيرفر اللي يشغّل AEGIS (نفس الشبكة)
// شوف الـ IP من: ipconfig (Windows) أو ifconfig (Mac/Linux)


// ════════════════════════════════════════════════════
// 📌  توصيل الأسلاك (Pinout)
//
//  ┌─────────────────┬──────────┬─────────────────┐
//  │ الموديول         │ طرف الموديول │ GPIO في ESP32  │
//  ├─────────────────┼──────────┼─────────────────┤
//  │ MQ-2 Gas        │ A0       │ 34  (ADC1)      │
//  │                 │ D0       │ 26  (اختياري)   │
//  ├─────────────────┼──────────┼─────────────────┤
//  │ Flame Sensor    │ D0       │ 27  (active-LOW)│
//  ├─────────────────┼──────────┼─────────────────┤
//  │ DS18B20 Temp    │ DATA     │ 4   + 4.7kΩ     │
//  ├─────────────────┼──────────┼─────────────────┤
//  │ Pulse Sensor    │ Signal   │ 36  (ADC1)      │
//  └─────────────────┴──────────┴─────────────────┘
//  جميع الموديولات: VCC → 3.3V  ،  GND → GND
//
// ════════════════════════════════════════════════════

#define MQ2_ANALOG_PIN      34
#define MQ2_DIGITAL_PIN     26
#define FLAME_PIN           27
#define TEMP_DATA_PIN        4
#define PULSE_PIN           36   // مقياس التردد — ADC1_CH0 (VP)

#define SEND_INTERVAL_MS  3000   // أرسل كل 3 ثوانٍ
#define MQ2_WARMUP_SEC      30   // ثوانٍ إحماء للـ MQ-2

// ════════════════════════════════════════════════════
// 🌡️  Temperature sensor
// ════════════════════════════════════════════════════

OneWire           oneWire(TEMP_DATA_PIN);
DallasTemperature tempSensor(&oneWire);

// ════════════════════════════════════════════════════
// 💓  Pulse / Heart Rate — Peak Detection
//
//  خوارزمية بسيطة وموثوقة:
//    - أخذ عينات كل 20ms
//    - اكتشاف القمم (peaks) فوق عتبة معينة
//    - حساب BPM من الزمن بين القمم
// ════════════════════════════════════════════════════

// Pulse detection state
volatile int   pulseRaw      = 0;
volatile bool  pulseBeat     = false;
volatile int   pulseBPM      = 0;
volatile unsigned long lastBeatTime = 0;
int  pulseThreshold = 2048;      // midpoint — يتعدّل تلقائياً
int  pulseMin       = 4095;
int  pulseMax       = 0;
bool pulseAbove     = false;
int  beatCount      = 0;
unsigned long bpmWindowStart = 0;
int  bpmSamples[10];
int  bpmSampleIdx  = 0;
bool bpmReady      = false;

// يُستدعى كل 20ms من Timer
hw_timer_t*  pulseTimer = nullptr;
portMUX_TYPE timerMux   = portMUX_INITIALIZER_UNLOCKED;

void IRAM_ATTR onPulseTimer() {
  portENTER_CRITICAL_ISR(&timerMux);
  pulseRaw = analogRead(PULSE_PIN);

  // Auto-calibrate range
  if (pulseRaw < pulseMin) pulseMin = pulseRaw;
  if (pulseRaw > pulseMax) pulseMax = pulseRaw;

  // Dynamic threshold = midpoint of range
  pulseThreshold = (pulseMin + pulseMax) / 2;

  // Peak detection (rising edge above threshold)
  bool nowAbove = (pulseRaw > pulseThreshold + 50);
  if (nowAbove && !pulseAbove) {
    // Rising edge = heartbeat
    unsigned long now = millis();
    unsigned long interval = now - lastBeatTime;
    if (interval > 300 && interval < 2000) {  // valid range 30–200 BPM
      int instantBPM = 60000 / interval;
      bpmSamples[bpmSampleIdx % 10] = instantBPM;
      bpmSampleIdx++;
      bpmReady = (bpmSampleIdx >= 5);  // need 5 beats for reliable avg

      if (bpmReady) {
        int sum = 0;
        int cnt = min(bpmSampleIdx, 10);
        for (int i = 0; i < cnt; i++) sum += bpmSamples[i];
        pulseBPM = sum / cnt;
      }
    }
    lastBeatTime = now;
  }
  pulseAbove = nowAbove;
  portEXIT_CRITICAL_ISR(&timerMux);
}

void startPulseTimer() {
  pulseTimer = timerBegin(0, 80, true);           // Timer 0, prescaler 80 → 1MHz
  timerAttachInterrupt(pulseTimer, &onPulseTimer, true);
  timerAlarmWrite(pulseTimer, 20000, true);        // 20ms interval
  timerAlarmEnable(pulseTimer);
}

int readHeartRate() {
  portENTER_CRITICAL(&timerMux);
  int bpm = bpmReady ? pulseBPM : 0;
  portEXIT_CRITICAL(&timerMux);
  return bpm;
}

// ════════════════════════════════════════════════════
// 💨  Gas Sensor (MQ-2)
// ════════════════════════════════════════════════════

// عدّل هذه القيمة: بعد الـ warm-up في هواء نظيف، اقرأ الـ Serial
// واستبدل 1000 بالقراءة الفعلية
#define GAS_CLEAN_AIR_RAW  1000

float readGasLevel() {
  long sum = 0;
  for (int i = 0; i < 10; i++) { sum += analogRead(MQ2_ANALOG_PIN); delay(2); }
  int raw = sum / 10;
  float ppm = 10.0 + ((float)(raw - GAS_CLEAN_AIR_RAW) / (4095.0 - GAS_CLEAN_AIR_RAW)) * 990.0;
  return max(0.0f, ppm);
}

// ════════════════════════════════════════════════════
// 🌡️  Temperature (DS18B20)
// ════════════════════════════════════════════════════

float readTemperature() {
  tempSensor.requestTemperatures();
  float t = tempSensor.getTempCByIndex(0);
  return (t == DEVICE_DISCONNECTED_C || t < -50 || t > 150) ? -999.0f : t;
}

// ════════════════════════════════════════════════════
// 🔥  Flame Sensor
// ════════════════════════════════════════════════════

bool readFlame() {
  return digitalRead(FLAME_PIN) == LOW;  // active-LOW
}

// ════════════════════════════════════════════════════
// 📶  WiFi
// ════════════════════════════════════════════════════

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("📶 Connecting WiFi");
  for (int i = 0; WiFi.status() != WL_CONNECTED && i < 40; i++) {
    delay(500); Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi OK — IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n❌ WiFi FAILED");
  }
}

// ════════════════════════════════════════════════════
// 📡  Send to AEGIS
// ════════════════════════════════════════════════════

void sendToAEGIS(float temperature, float gasLevel, bool flame, int heartRate) {
  if (WiFi.status() != WL_CONNECTED) { connectWiFi(); return; }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  StaticJsonDocument<300> doc;
  doc["deviceCode"]    = DEVICE_CODE;
  doc["temperature"]   = round(temperature * 10.0) / 10.0;
  doc["gasLevel"]      = round(gasLevel     * 10.0) / 10.0;
  doc["flameDetected"] = flame;
  if (heartRate > 0) doc["heartRate"] = heartRate;  // بُعث فقط لو كانت القراءة جاهزة

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code == 200) {
    Serial.printf("✅  T=%.1f°C  Gas=%.0fppm  Flame=%s  HR=%dbpm\n",
      temperature, gasLevel, flame ? "🔥" : "—", heartRate);
  } else {
    Serial.printf("❌  HTTP %d\n", code);
  }
  http.end();
}

// ════════════════════════════════════════════════════
// 🚀  Setup & Loop
// ════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("╔═════════════════════════════════════╗");
  Serial.println("║    AEGIS ESP32 Sensor Node v2.0     ║");
  Serial.println("║  Gas · Temp · Flame · Heart Rate    ║");
  Serial.println("╚═════════════════════════════════════╝");

  // Pins
  pinMode(FLAME_PIN,       INPUT_PULLUP);
  pinMode(MQ2_DIGITAL_PIN, INPUT);
  analogReadResolution(12);   // 12-bit: 0–4095
  analogSetAttenuation(ADC_11db);  // للـ ESP32: يسمح بقراءة حتى 3.3V

  // DS18B20
  tempSensor.begin();
  Serial.printf("🌡️  DS18B20 found: %d sensor(s)\n", tempSensor.getDeviceCount());

  // Pulse timer
  startPulseTimer();
  Serial.println("💓 Pulse timer started (20ms sampling)");

  // MQ-2 warm-up
  Serial.printf("🔥 MQ-2 warm-up: %d seconds...\n", MQ2_WARMUP_SEC);
  for (int i = MQ2_WARMUP_SEC; i > 0; i--) {
    Serial.printf("   ⏱  %2d sec  |  raw=%d\r", i, analogRead(MQ2_ANALOG_PIN));
    delay(1000);
  }
  Serial.println("\n✅ MQ-2 ready!");

  connectWiFi();
  Serial.println("\n📡 Sending every " + String(SEND_INTERVAL_MS/1000) + " seconds...");
  Serial.println("──────────────────────────────────────────");
}

unsigned long lastSend = 0;

void loop() {
  if (millis() - lastSend >= SEND_INTERVAL_MS) {
    lastSend = millis();

    float temperature = readTemperature();
    float gasLevel    = readGasLevel();
    bool  flame       = readFlame();
    int   heartRate   = readHeartRate();

    if (temperature > -900) {
      sendToAEGIS(temperature, gasLevel, flame, heartRate);
    } else {
      Serial.println("⚠️  DS18B20 disconnected — check wiring!");
    }
  }
}
