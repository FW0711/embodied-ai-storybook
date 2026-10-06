#include <WiFi.h>
#include <HTTPClient.h>

// Wi-Fi 設定
const char* ssid = "21075f-2.4";
const char* password = "0921595583";

// 電腦區域 IP
const char* serverUrl = "http://192.168.0.113:3000/api/sensor-event";

//  3-Pin 超音波感測器：SIG 線接在 GPIO 18 (D18)
const int ULTRASONIC_PIN = 18; 

unsigned long lastTriggerTime = 0;
unsigned long lastPrintTime = 0;

void sendGestureEvent(float dist, String actionChoice) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\"distance\":" + String(dist) + ",\"action\":\"" + actionChoice + "\"}";
    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      Serial.printf("事件成功送出至後端！回應碼: %d\n", httpResponseCode);
    } else {
      Serial.printf("送出失敗，錯誤: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();
  }
}

// 3-Pin / Single-Pin 專用測距函式
float getSinglePinDistanceCm(int pin) {
  // 1. 設為 OUTPUT 發射 10us 高電位脈衝
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  delayMicroseconds(2);
  digitalWrite(pin, HIGH);
  delayMicroseconds(10);
  digitalWrite(pin, LOW);

  // 2. 切換為 INPUT 接收 Echo 脈衝
  pinMode(pin, INPUT);
  long duration = pulseIn(pin, HIGH, 30000); // 30ms 超時

  if (duration <= 0) return -1.0;
  return (duration * 0.034) / 2.0;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- ESP32 3-Pin 超音波感測系統啟動 ---");

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
}

void loop() {
  float distanceCm = getSinglePinDistanceCm(ULTRASONIC_PIN);

  // 每 0.5 秒日誌輸出
  if (millis() - lastPrintTime > 500) {
    lastPrintTime = millis();
    if (distanceCm <= 0) {
      Serial.println(" 尚未偵測到訊號 (VCC 5V/VIN，SIG D18)");
    } else {
      Serial.printf("測量距離: %.1f cm\n", distanceCm);
    }
  }

  // 手勢判斷 (近距離 <10cm 選 A，遠距離 20~35cm 選 B)
  if (distanceCm >= 2.0 && distanceCm < 10.0) {
    if (millis() - lastTriggerTime > 2500) {
      Serial.println(" 偵測到【近距離手勢】(<10cm) -> 選擇分支 A");
      sendGestureEvent(distanceCm, "CHOICE_A");
      lastTriggerTime = millis();
    }
  } else if (distanceCm >= 20.0 && distanceCm <= 35.0) {
    if (millis() - lastTriggerTime > 2500) {
      Serial.println(" 偵測到【遠距離手勢】(20-35cm) -> 選擇分支 B");
      sendGestureEvent(distanceCm, "CHOICE_B");
      lastTriggerTime = millis();
    }
  }

  delay(100);
}