#  具身 AI 繪本動態手勢互動系統 (Embodied AI Storybook System)

> **結合 ESP32 實體手勢感測、Gemini AI 動態故事生成與 Web 視覺化之教具與人機互動原型**

---

##  專案簡介

本專案旨在探討 **具身認知 (Embodied Cognition)** 與 **人機共調 (Human-Agent Co-Adaptation)** 在教育場域的實踐。

學生能透過**實體空間的手勢距離（近距離 <10cm / 遠距離 20~35cm）**，實時為繪本主角進行抉擇。系統後端整合 **Google Gemini 大語言模型** 與 **Pollinations AI 繪圖**，自動即時續寫分支故事並生成渲染插圖，打造兼具實體體驗與即時視覺反饋的 AI 互動繪本系統。

---

##  系統架構 

系統由三大模組構成：

1. **Firmware (`/firmware`)**：ESP32 搭載 3-Pin 超音波感測器，採樣手勢距離並判斷為分支 A（<10cm）或分支 B（20~35cm），透過 Wi-Fi 發送 JSON 訊號。

2. **Backend (`/server`)**：Node.js Express 伺服器，負責與 Google Gemini API 通訊（支援自動切換模型與備用重試機制），並將生成歷程寫入 SQLite 資料庫 (`storybook.db`)。

3. **Frontend (`/public`)**：Tailwind CSS 打造的響應式教具介面，具備輪詢（Polling）事件監聽、自動渲染繪本卡片與 Web Speech API 中文語音朗讀。


---

## 📁 資料夾結構 (Directory Structure)

```text
├── firmware/
│   └── esp32_gesture_sensor.ino   # ESP32 3-Pin 超音波距離檢測與 HTTP 請求處理
├── server/
│   └── server.js                  # Express API 伺服器、Gemini 容錯調用與 SQLite 邏輯
├── public/
│   └── index.html                 # 學生/教師端視覺化互動介面 (Web Speech API + Polling)
├── .env.example                   # 環境變數範本
└── README.md                      # 專案說明文件