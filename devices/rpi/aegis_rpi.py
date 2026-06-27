#!/usr/bin/env python3
"""
AEGIS HSSE Platform — Raspberry Pi Vision Node
===============================================
يرصد الكاميرا ويرسل نتائج الكشف إلى:
  POST http://<SERVER_IP>:3000/api/devices/rpi/detect

الكشف المدعوم:
  - خوذة / بدون خوذة (helmet / no_helmet)
  - سترة / بدون سترة (vest / no_vest)
  - حريق / دخان (fire / smoke)
  - تسرب نفط (oil_leak)
  - فحص الكولر (cooler_check)

المتطلبات:
  pip install opencv-python requests numpy

للتشغيل:
  python3 aegis_rpi.py

للتشغيل التلقائي عند الإقلاع:
  sudo nano /etc/rc.local
  أضف قبل exit 0:
    python3 /home/pi/aegis_rpi.py &
"""

import cv2
import requests
import numpy as np
import time
import json
import logging
from datetime import datetime

# ─── إعدادات ─────────────────────────────────────────────────
AEGIS_SERVER   = "http://192.168.1.100:3000"   # ← IP سيرفر AEGIS
DEVICE_CODE    = "RPI-001"                      # ← رمز فريد لهذا الجهاز
SITE_CODE      = "SITE-A"                       # ← رمز الموقع (أو "")
DEVICE_SECRET  = ""                             # ← قيمة DEVICE_INGEST_SECRET من .env

CAMERA_INDEX   = 0          # 0 = كاميرا USB أولى, -1 = تلقائي
FRAME_INTERVAL = 2.0        # ثوانٍ بين كل تحليل
MIN_CONFIDENCE = 0.60       # أقل درجة ثقة لإرسال الكشف
SEND_OK_LABELS = False      # True = أرسل كل شيء بما فيه "helmet" و"vest"

# ─── إعداد السجل ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("AEGIS-RPi")

# ─── المسارات ─────────────────────────────────────────────────
INGEST_URL  = f"{AEGIS_SERVER}/api/devices/rpi/detect"
HEADERS     = {"Content-Type": "application/json"}
if DEVICE_SECRET:
    HEADERS["X-Device-Secret"] = DEVICE_SECRET

# ══════════════════════════════════════════════════════════════
# كاشف PPE باستخدام ألوان (Color-based fallback)
# في البيئة الحقيقية: استبدل detect_ppe() بنموذج YOLO أو TFLite
# ══════════════════════════════════════════════════════════════

def detect_ppe(frame: np.ndarray) -> list[dict]:
    """
    كشف PPE باستخدام الألوان كمثال.
    ─────────────────────────────────────────────
    استبدل هذه الدالة بنموذجك الفعلي:
      - YOLO:    results = model(frame)
      - TFLite:  interpreter.invoke()
    ─────────────────────────────────────────────
    الإخراج: قائمة من {"label": str, "confidence": float}
    """
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # كشف الخوذة (الأصفر / البرتقالي)
    mask_helmet = (
        cv2.inRange(hsv, np.array([20, 100, 100]), np.array([35, 255, 255]))  # أصفر
        | cv2.inRange(hsv, np.array([5, 150, 150]), np.array([20, 255, 255])) # برتقالي
    )
    helmet_ratio = cv2.countNonZero(mask_helmet) / (frame.shape[0] * frame.shape[1])

    # كشف السترة (البرتقالي / الأصفر الزاهي)
    mask_vest = cv2.inRange(hsv, np.array([10, 200, 150]), np.array([25, 255, 255]))
    vest_ratio = cv2.countNonZero(mask_vest) / (frame.shape[0] * frame.shape[1])

    # كشف الحريق / اللهب (الأحمر/البرتقالي الساطع)
    mask_fire = (
        cv2.inRange(hsv, np.array([0, 200, 200]), np.array([10, 255, 255]))
        | cv2.inRange(hsv, np.array([170, 200, 200]), np.array([180, 255, 255]))
    )
    fire_ratio = cv2.countNonZero(mask_fire) / (frame.shape[0] * frame.shape[1])

    # كشف الدخان (الرمادي الداكن)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    _, smoke_mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    smoke_ratio = cv2.countNonZero(smoke_mask) / (frame.shape[0] * frame.shape[1])

    results = []

    # خوذة
    if helmet_ratio > 0.03:
        results.append({"label": "helmet",    "confidence": min(helmet_ratio * 10, 0.95)})
    else:
        results.append({"label": "no_helmet", "confidence": 0.70})

    # سترة
    if vest_ratio > 0.05:
        results.append({"label": "vest",      "confidence": min(vest_ratio * 8, 0.92)})
    else:
        results.append({"label": "no_vest",   "confidence": 0.70})

    # حريق
    if fire_ratio > 0.02:
        results.append({"label": "fire",      "confidence": min(fire_ratio * 15, 0.95)})

    # دخان
    if smoke_ratio > 0.30:
        results.append({"label": "smoke",     "confidence": min(smoke_ratio * 2, 0.85)})

    return results


def send_detection(label: str, confidence: float, all_scores: dict | None = None) -> bool:
    """إرسال كشف واحد إلى AEGIS API"""
    payload = {
        "deviceCode": DEVICE_CODE,
        "label":      label,
        "confidence": round(confidence, 3),
    }
    if SITE_CODE:
        payload["siteCode"] = SITE_CODE
    if all_scores:
        payload["allScores"] = {k: round(v, 3) for k, v in all_scores.items()}

    try:
        r = requests.post(INGEST_URL, json=payload, headers=HEADERS, timeout=5)
        if r.ok:
            data = r.json()
            alert_icon = "🔔" if data.get("data", {}).get("alertCreated") else "✓"
            log.info(f"{alert_icon} أُرسل: {label} ({confidence:.0%}) → {r.status_code}")
            return True
        else:
            log.warning(f"✗ فشل الإرسال {r.status_code}: {r.text[:100]}")
            return False
    except requests.exceptions.RequestException as e:
        log.error(f"✗ خطأ في الشبكة: {e}")
        return False


# ══════════════════════════════════════════════════════════════
def main():
    log.info("═══ AEGIS Raspberry Pi Vision Node ════════════")
    log.info(f"  الجهاز : {DEVICE_CODE}")
    log.info(f"  الموقع : {SITE_CODE or 'غير محدد'}")
    log.info(f"  السيرفر: {AEGIS_SERVER}")
    log.info(f"  الكاميرا: {CAMERA_INDEX}")
    log.info("═══════════════════════════════════════════════")

    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        log.error("✗ لا يمكن فتح الكاميرا! تحقق من الاتصال.")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    log.info("✓ الكاميرا مفتوحة")

    last_send = 0.0
    frame_count = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                log.warning("✗ لم يمكن قراءة إطار — إعادة المحاولة")
                time.sleep(1)
                continue

            frame_count += 1
            now = time.time()

            # تحليل كل N ثانية
            if now - last_send >= FRAME_INTERVAL:
                last_send = now
                log.info(f"── تحليل إطار #{frame_count} ──")

                detections = detect_ppe(frame)
                all_scores = {d["label"]: d["confidence"] for d in detections}

                # اختر أهم كشف (الأعلى confidence)
                for det in sorted(detections, key=lambda x: x["confidence"], reverse=True):
                    label      = det["label"]
                    confidence = det["confidence"]

                    # تجاهل Labels "OK" إلا إذا مفعّل SEND_OK_LABELS
                    ok_labels = {"helmet", "vest", "mesh_guard", "cooler_check", "person"}
                    if label in ok_labels and not SEND_OK_LABELS:
                        log.info(f"  ← تجاهل '{label}' (OK)")
                        continue

                    if confidence < MIN_CONFIDENCE:
                        log.info(f"  ← تجاهل '{label}' (ثقة منخفضة: {confidence:.0%})")
                        continue

                    send_detection(label, confidence, all_scores)
                    break  # أرسل فقط الأهم

            # اختياري: عرض الكاميرا (احذف إذا كان RPi بدون شاشة)
            # cv2.imshow("AEGIS Vision", frame)
            # if cv2.waitKey(1) & 0xFF == ord('q'):
            #     break

            time.sleep(0.1)

    except KeyboardInterrupt:
        log.info("⏹ إيقاف من قِبَل المستخدم")
    finally:
        cap.release()
        cv2.destroyAllWindows()
        log.info("✓ انتهى البرنامج")


if __name__ == "__main__":
    main()
