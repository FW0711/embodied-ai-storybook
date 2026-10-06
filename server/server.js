const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

//  初始化 SQLite 資料庫
const dbPath = path.join(__dirname, 'storybook.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(' SQLite 資料庫連線失敗:', err.message);
  } else {
    console.log(' SQLite 資料庫連線成功');
  }
});

// 自動建立故事歷史紀錄表 (stories)
db.run(`
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    age_group TEXT NOT NULL,
    title TEXT NOT NULL,
    story_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 🔄 官方標準且未停用的最新 Gemini 模型清單
const MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite'
];

function callGeminiAPI(apiKey, promptText, modelIndex = 0, retryCount = 0) {
  return new Promise((resolve, reject) => {
    const currentModel = MODELS[modelIndex] || MODELS[0];
    
    const postData = JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${encodeURIComponent(currentModel)}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log(` [Attempt] 嘗試模型 ${currentModel} (重試: ${retryCount})...`);

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', async () => {
        try {
          const responseData = JSON.parse(data);

          const isDemandError = response.statusCode === 503 || 
                                response.statusCode === 429 || 
                                (responseData.error && responseData.error.message.includes('demand'));

          const isNotFoundError = response.statusCode === 404 || 
                                  (responseData.error && (
                                    responseData.error.message.includes('not found') || 
                                    responseData.error.message.includes('no longer available')
                                  ));

          //  伺服器繁忙時，自動等待 3 秒重試
          if (isDemandError) {
            if (retryCount < 3) {
              console.warn(` 模型 ${currentModel} 繁忙，等待 3 秒後重試...`);
              await new Promise(r => setTimeout(r, 3000));
              return resolve(callGeminiAPI(apiKey, promptText, modelIndex, retryCount + 1));
            } else if (modelIndex < MODELS.length - 1) {
              console.warn(`⚠ 切換至備用模型 ${MODELS[modelIndex + 1]}...`);
              return resolve(callGeminiAPI(apiKey, promptText, modelIndex + 1, 0));
            }
          }

          if (isNotFoundError && modelIndex < MODELS.length - 1) {
            console.warn(`⚠ 模型 ${currentModel} 不可用，跳過...`);
            return resolve(callGeminiAPI(apiKey, promptText, modelIndex + 1, 0));
          }

          if (response.statusCode !== 200) {
            return reject(new Error(responseData.error?.message || `API Error Status: ${response.statusCode}`));
          }

          const rawText = responseData.candidates[0].content.parts[0].text;
          resolve(JSON.parse(rawText));

        } catch (err) {
          reject(new Error('解析 Gemini 回傳內容失敗: ' + err.message));
        }
      });
    });

    request.on('error', (error) => {
      reject(new Error('網路請求失敗: ' + error.message));
    });

    request.write(postData);
    request.end();
  });
}

//  1. 生成故事與寫入 SQLite 資料庫 API
app.post('/api/generate-story', async (req, res) => {
  try {
    const { topic, ageGroup } = req.body;
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();

    if (!apiKey) {
      return res.status(500).json({ error: '伺服器未讀取到 GEMINI_API_KEY，請確認 .env 設定' });
    }

    const promptText = `你是一位專業的兒童繪本創作者與視覺設計師。請根據以下設定創作一個故事：
- 主題：${topic}
- 目標讀者年齡：${ageGroup || '低年級'}

請創作一個短故事（若無特別指定頁數，預設為 3 頁），並為每一頁提供可作為 AI 繪圖工具的英文 Prompt。
imagePrompt 撰寫規範：
1. 必須精準（50-150個英文單字）。
2. 格式必須為："[Main Character] [Action/Emotion], [Setting/Environment], children storybook illustration, watercolor style, warm vibrant colors"。
3. 確保主角名稱在每頁的 imagePrompt 中保持高度一致。

請嚴格輸出符合以下 JSON 格式的回傳內容（絕對不要加上 markdown 的 \`\`\`json 標記）：
{
  "title": "故事標題",
  "pages": [
    {
      "pageNumber": 1,
      "text": "第一頁故事內容（中文）",
      "imagePrompt": "A cute character sitting in a warm setting, children storybook illustration, watercolor style"
    },
    {
      "pageNumber": 2,
      "text": "第二頁故事內容（中文）",
      "imagePrompt": "A cute character having an adventure, children storybook illustration, watercolor style"
    },
    {
      "pageNumber": 3,
      "text": "第三頁故事內容（中文）",
      "imagePrompt": "A cute character smiling happily with friends, children storybook illustration, watercolor style"
    }
  ]
}`;

    console.log(" [Server] 收到生成請求，主題：", topic);
    const storyResult = await callGeminiAPI(apiKey, promptText);

    //  將產出的故事存入 SQLite 資料庫
    const insertSql = `INSERT INTO stories (topic, age_group, title, story_json) VALUES (?, ?, ?, ?)`;
    db.run(insertSql, [topic, ageGroup, storyResult.title, JSON.stringify(storyResult)], function(err) {
      if (err) {
        console.error(' 資料庫寫入失敗:', err.message);
      } else {
        console.log(` 故事已成功存入資料庫 (ID: ${this.lastID})`);
      }
    });

    console.log(" [Server] 故事成功生成！");
    res.json(storyResult);

  } catch (error) {
    console.error(' [Server Error]:', error.message);
    res.status(500).json({ error: '伺服器繁忙：' + error.message });
  }
});

//  2. 取得歷史故事紀錄 API
app.get('/api/history', (req, res) => {
  const sql = `SELECT id, topic, age_group, title, created_at FROM stories ORDER BY id DESC LIMIT 10`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: '無法讀取歷史紀錄' });
    res.json(rows);
  });
});

//  3. 接收 ESP32 超音波手勢訊號 API
let latestSensorEvent = null;

app.post('/api/sensor-event', (req, res) => {
  const { distance, action } = req.body;
  console.log(` [Sensor Event] 距離: ${distance} cm, 動作: ${action}`);
  
  // 記錄最新事件與未讀標記
  latestSensorEvent = { distance, action, newEvent: true, timestamp: Date.now() };
  res.status(200).json({ status: 'success', action });
});

app.get('/api/sensor-event/latest', (req, res) => {
  if (latestSensorEvent && latestSensorEvent.newEvent) {
    const eventToSend = { ...latestSensorEvent };
    latestSensorEvent.newEvent = false; // 讀取後重設標記，避免重複觸發
    return res.json(eventToSend);
  }
  res.json({ newEvent: false });
});

//  啟動伺服器
app.listen(PORT, () => {
  console.log(` 伺服器已重新啟動：http://localhost:${PORT}`);
});