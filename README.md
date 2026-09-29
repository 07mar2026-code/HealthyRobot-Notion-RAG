# HealthyRobot Notion RAG

健康陪跑員的 LINE × n8n × Notion RAG workflow 原始碼專案。

## 目前內容

- `workflows/healthyrobot-line-notion-rag-draft.mjs`
  - 接收 LINE 文字訊息。
  - 從 Notion `RAG_Nutrtion` 資料庫列出相關文章並讀取頁面內文。
  - 使用 OpenAI 產生繁體中文、附資料來源且具健康安全界線的回覆。
  - 使用每位 LINE 使用者獨立的短期對話記憶。
  - 透過 n8n Credential 回覆 LINE，不在程式碼中儲存 token。
- `workflows/healthyrobot-line-notion-rag-gemini-fallback.mjs`
  - 先以關鍵字評分選出最相關的 Notion 文章，再讀取實際頁面內文。
  - Gemini 可用時，將 Notion 內容整理成自然語言回覆。
  - Gemini credential、額度或呼叫失敗時，改回傳 Notion 原文節錄、文章名稱與網址。
  - 使用獨立測試 Webhook，不接管正式 `line-health-bot`。

## n8n 草稿

- n8n workflow：`健康陪跑員｜LINE × Notion RAG（未發布草稿）`
- Workflow ID：`wPZTx1KLlpqxDt4e`
- 測試 Webhook path：`line-health-companion-rag-draft`
- 狀態：已建立草稿，尚未發布、尚未接管正式 LINE Webhook。

正式 LINE workflow 目前使用 `line-health-bot`。在完成 Notion 實際讀取、OpenAI 回覆與 LINE 測試之前，不應以第二個 Production Webhook 取代正式設定。

Gemini＋無模型備援版建立後會使用獨立草稿與測試 Webhook `line-health-companion-gemini-fallback-draft`；它與原 OpenAI 草稿並存，不覆寫原始版本。

- Gemini＋備援 workflow：`健康陪跑員｜Gemini＋Notion 無模型備援（未發布草稿）`
- Workflow ID：`QEUFscAPVtzcKGJ2`
- 狀態：已建立並驗證，尚未發布。

## 必要的 n8n Credentials

請在 n8n UI 中建立或選取以下 credential；不要把金鑰寫進本 repo：

- OpenAI：`OpenAI account 2`
- Google Gemini：`Google Gemini(PaLM) Api account`
- Notion：`Notion account`
- LINE Header Auth：`LINE Messaging API｜健康陪跑員`

## 安全原則

- 不提交 OpenAI API key、Notion token、LINE Channel access token 或完整 LINE userId。
- 健康回覆必須以 Notion 知識庫內容為依據；資料不足時明確說明，不以模型記憶補寫醫療事實。
- 不診斷、不開藥、不保證療效；急症與高風險情境優先轉介急救或專業人員。
- 本機驗證、n8n 儲存草稿、發布 workflow、LINE 實際送達是不同完成層級，不能互相替代。

## 開發流程

1. 修改 `workflows/*.mjs`。
2. 使用 n8n Workflow SDK 驗證，必須得到 `valid: true`。
3. 建立或更新 n8n 草稿。
4. 核對 credential 名稱與節點設定。
5. 使用不含個資的測試訊息驗證 Notion 檢索與 AI 回覆。
6. 取得確認後，才合併至正式 LINE workflow 並發布。

## 目前驗證結果

- SDK validation：通過。
- 節點數：9。
- Notion credentials：草稿已自動配對。
- OpenAI credential：已在 n8n UI 改選 `OpenAI account 2`。
- LINE credential：草稿畫面顯示已選取 `LINE Messaging API｜健康陪跑員`。
- 實際 Notion 檢索、OpenAI 生成與 LINE 回覆：尚未執行。
- Gemini 主路徑測試：成功，回覆模式 `gemini-rag`。
- Gemini 刻意失敗測試：成功切換為 `notion-keyword-fallback`。
- LINE 節點測試使用 pin data，沒有送出真實訊息。

## Gemini＋無模型備援的行為

1. Notion 連線失敗：流程停止，不傳送未經來源支持的健康內容。
2. Gemini 正常：回覆模式為 `gemini-rag`。
3. Gemini credential 缺少、額度不足或呼叫失敗：回覆模式為 `notion-keyword-fallback`。
4. 備援內容只使用實際讀取的 Notion 文章段落，並保留文章名稱與網址。
