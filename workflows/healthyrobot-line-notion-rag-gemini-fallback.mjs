import {
  workflow,
  node,
  trigger,
  languageModel,
  newCredential,
  expr,
  nodeJson,
  sticky,
} from '@n8n/workflow-sdk';

const lineWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'LINE Gemini RAG 測試 Webhook',
    position: [120, 300],
    parameters: {
      httpMethod: 'POST',
      path: 'line-health-companion-gemini-fallback-draft',
      responseMode: 'onReceived',
      options: { noResponseBody: true },
    },
  },
  output: [{
    body: {
      events: [{
        type: 'message',
        replyToken: 'sample-reply-token',
        source: { userId: 'sample-user' },
        message: { type: 'text', text: '最近很疲累，有什麼生活調整方向？' },
      }],
    },
  }],
});

const prepareLineMessage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: '驗證並整理 LINE 訊息',
    position: [340, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const events = $input.first().json.body?.events || [];
return events
  .filter((event) => event.type === 'message' && event.message?.type === 'text' && event.replyToken)
  .map((event) => ({ json: {
    replyToken: event.replyToken,
    userId: event.source?.userId || event.source?.groupId || event.source?.roomId || 'unknown',
    question: String(event.message.text || '').trim().slice(0, 1000),
  }}))
  .filter((item) => item.json.question.length > 0);`,
    },
  },
  output: [{
    replyToken: 'sample-reply-token',
    userId: 'sample-user',
    question: '最近很疲累，有什麼生活調整方向？',
  }],
});

const listRagPages = node({
  type: 'n8n-nodes-base.notion',
  version: 2.2,
  config: {
    name: '列出 RAG_Nutrtion 文章',
    position: [560, 300],
    executeOnce: true,
    parameters: {
      resource: 'databasePage',
      operation: 'getAll',
      authentication: 'apiKey',
      databaseId: {
        __rl: true,
        mode: 'url',
        value: 'https://www.notion.so/3aa00fa2d0a780de9fc1d79a5bcb722d',
        cachedResultName: 'RAG_Nutrtion',
      },
      returnAll: true,
      simple: true,
      filterType: 'none',
      options: {},
    },
    credentials: { notionApi: newCredential('Notion account') },
  },
  output: [{
    id: 'sample-notion-page-id',
    name: '活力與疲勞的生活調整',
    url: 'https://www.notion.so/sample',
    property_status: 'Done',
  }],
});

const selectBestPage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: '無模型關鍵字檢索',
    position: [780, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const question = String($('驗證並整理 LINE 訊息').first().json.question || '').toLowerCase();
const stop = new Set(['最近','什麼','怎麼','如何','可以','是否','因為','覺得','一下','有什麼','方向','問題']);
const aliases = {
  '疲累': ['疲累','疲勞','活力','精神','壓力','睡眠'],
  '疲勞': ['疲累','疲勞','活力','精神','壓力','睡眠'],
  '睡眠': ['睡眠','失眠','安眠','睡姿','作息'],
  '蛋白質': ['蛋白質','營養','飲食','肌肉'],
  '過敏': ['過敏','免疫','發炎'],
  '腎臟': ['腎臟','腎病','蛋白尿','透析'],
  '壓力': ['壓力','焦慮','情緒','心理','活力'],
};
const rawTerms = question.match(/[\\u4e00-\\u9fff]{2,6}|[a-z0-9]{2,}/g) || [];
const aliasTerms = Object.entries(aliases)
  .filter(([key]) => question.includes(key))
  .flatMap(([, values]) => values);
const terms = [...new Set([
  ...rawTerms.filter((term) => !stop.has(term)).flatMap((term) => aliases[term] || [term]),
  ...aliasTerms,
])];

const ranked = $input.all().map((item, index) => {
  const row = item.json || {};
  const title = String(row.name || row.property_name || '未命名文章');
  const searchable = JSON.stringify(row).toLowerCase();
  let score = terms.reduce((sum, term) => sum + (searchable.includes(term) ? (title.includes(term) ? 5 : 2) : 0), 0);
  if (String(row.property_status || '').toLowerCase() === 'done') score += 1;
  return { row, title, score, index };
}).sort((a, b) => b.score - a.score || a.index - b.index);

const best = ranked[0];
if (!best?.row?.id) {
  return [{ json: {
    found: false,
    question,
    articleTitle: '',
    articleUrl: '',
    pageId: '',
    fallbackReply: '目前 Notion 知識庫沒有足夠資料。你最想先改善的是飲食、睡眠、壓力，還是活動量呢？',
  }}];
}

const directMatch = best.score > 1;
const fallbackReply = directMatch
  ? '我先從知識庫找到可能相關的資料：〈' + best.title + '〉。\\n\\n你可以先閱讀原文，再告訴我最想處理的具體情境，我會陪你拆成小步驟。\\n' + String(best.row.url || '') + '\\n\\n資料來源：' + best.title
  : '目前 Notion 知識庫沒有找到與問題高度吻合的內容。較接近的文章是〈' + best.title + '〉：\\n' + String(best.row.url || '') + '\\n\\n你可以再補充想改善的是飲食、睡眠、壓力或活動量。';

return [{ json: {
  found: true,
  directMatch,
  question,
  pageId: best.row.id,
  articleTitle: best.title,
  articleUrl: String(best.row.url || ''),
  retrievalScore: best.score,
  fallbackReply,
}}];`,
    },
  },
  output: [{
    found: true,
    directMatch: true,
    question: '最近很疲累，有什麼生活調整方向？',
    pageId: 'sample-notion-page-id',
    articleTitle: '活力與疲勞的生活調整',
    articleUrl: 'https://www.notion.so/sample',
    retrievalScore: 8,
    fallbackReply: '我先從知識庫找到可能相關的資料。',
  }],
});

const readRagPage = node({
  type: 'n8n-nodes-base.notion',
  version: 2.2,
  config: {
    name: '讀取最相關文章內文',
    position: [1000, 300],
    parameters: {
      resource: 'block',
      operation: 'getAll',
      authentication: 'apiKey',
      blockId: {
        __rl: true,
        mode: 'id',
        value: nodeJson(selectBestPage, 'pageId'),
      },
      returnAll: true,
      fetchNestedBlocks: true,
      simplifyOutput: true,
    },
    credentials: { notionApi: newCredential('Notion account') },
  },
  output: [{
    id: 'sample-block-id',
    type: 'paragraph',
    content: '主觀活力會受到壓力、睡眠與生活節奏影響。',
  }],
});

const assembleContext = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: '組合 RAG 內容與備援回覆',
    position: [1220, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const selected = $('無模型關鍵字檢索').first().json;
const content = $input.all()
  .map((item) => String(item.json.content || '').trim())
  .filter(Boolean)
  .join('\\n')
  .slice(0, 7000);

const safety = '不診斷、不開藥、不保證療效。若有胸痛、呼吸困難、嚴重過敏反應、自傷意念或其他急性危險症狀，請立即聯絡當地急救或專業人員。';
const fallbackReply = selected.directMatch && content
  ? '我先從知識庫找到〈' + selected.articleTitle + '〉。以下是原文重點節錄：\\n\\n' + content.slice(0, 550) + '\\n\\n你可以告訴我哪一點最貼近目前情況，我再陪你拆成小步驟。\\n\\n資料來源：' + selected.articleTitle + '\\n' + selected.articleUrl + '\\n\\n' + safety
  : selected.fallbackReply;

return [{ json: {
  question: selected.question,
  articleTitle: selected.articleTitle,
  articleUrl: selected.articleUrl,
  ragContent: content,
  fallbackReply,
  prompt: '你是健康陪跑員。只能依據下方 Notion 文章內容，以繁體中文回答，不可使用模型記憶補充醫療事實。先同理，再提供 1–3 個低壓力、可執行的小步驟，最後列出資料來源文章名稱與網址。這是 LINE 純文字訊息，不使用 Markdown、粗體星號或表格。全文不超過 350 個中文字。不得診斷、開藥或保證療效；急症與高風險情境應優先轉介。\\n\\n使用者問題：' + selected.question + '\\n\\nNotion 文章：' + selected.articleTitle + '\\n網址：' + selected.articleUrl + '\\n\\n文章內容：\\n' + content,
}}];`,
    },
  },
  output: [{
    question: '最近很疲累，有什麼生活調整方向？',
    articleTitle: '活力與疲勞的生活調整',
    articleUrl: 'https://www.notion.so/sample',
    ragContent: '主觀活力會受到壓力、睡眠與生活節奏影響。',
    fallbackReply: '我先從知識庫找到可能相關的資料。',
    prompt: '請依據 Notion 文章回答使用者問題。',
  }],
});

const geminiModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  version: 1.1,
  config: {
    name: 'Gemini 回覆模型',
    position: [1430, 550],
    parameters: {
      modelName: 'models/gemini-3.1-flash-lite',
      options: {
        maxOutputTokens: 600,
        temperature: 0.2,
      },
    },
    credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account') },
  },
  output: [{ text: '依據 Notion 內容產生的健康陪跑回覆。' }],
});

const geminiReply = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: {
    name: 'Gemini RAG 回覆',
    position: [1460, 300],
    onError: 'continueRegularOutput',
    parameters: {
      promptType: 'define',
      text: expr('{{ $json.prompt }}'),
      hasOutputParser: false,
      needsFallback: false,
      batching: { batchSize: 1, delayBetweenBatches: 0 },
    },
    subnodes: { model: geminiModel },
  },
  output: [{ text: 'Gemini 根據 Notion 內容產生的回覆。' }],
});

const chooseReply = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: '選擇 Gemini 或無模型備援',
    position: [1680, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const result = $input.first()?.json || {};
const context = $('組合 RAG 內容與備援回覆').first().json;
const candidate = [result.text, result.output, result.response]
  .find((value) => typeof value === 'string' && value.trim().length > 0);
const geminiFailed = Boolean(result.error) || !candidate;
return [{ json: {
  output: geminiFailed ? context.fallbackReply : candidate.trim(),
  responseMode: geminiFailed ? 'notion-keyword-fallback' : 'gemini-rag',
  articleTitle: context.articleTitle,
  articleUrl: context.articleUrl,
}}];`,
    },
  },
  output: [{
    output: '根據 Notion 文章提供的回覆。',
    responseMode: 'gemini-rag',
    articleTitle: '活力與疲勞的生活調整',
    articleUrl: 'https://www.notion.so/sample',
  }],
});

const lineReply = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: '回覆 LINE 用戶（Gemini＋備援草稿）',
    position: [1900, 300],
    parameters: {
      method: 'POST',
      url: 'https://api.line.me/v2/bot/message/reply',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [{ name: 'Content-Type', value: 'application/json' }],
      },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ { replyToken: $("驗證並整理 LINE 訊息").item.json.replyToken, messages: [{ type: "text", text: String($json.output || "目前暫時無法回覆，請稍後再試。").slice(0, 4500) }] } }}'),
      options: { timeout: 10000 },
    },
    credentials: { httpHeaderAuth: newCredential('LINE Messaging API｜健康陪跑員') },
  },
  output: [{ sentMessages: [{ id: 'sample-message-id' }] }],
});

const draftNote = sticky(
  '## Gemini＋無模型備援（未發布草稿）\n先用 Notion 標題與分類做關鍵字檢索，再讀取文章內文。Gemini 可用時進行自然語言整理；credential、額度或模型呼叫失敗時，改用 Notion 原文節錄與來源連結。此流程使用獨立測試 Webhook，不接管正式 `line-health-bot`。',
  [lineWebhook, prepareLineMessage, listRagPages, selectBestPage, readRagPage, assembleContext, geminiReply, chooseReply, lineReply],
  { color: 5 },
);

export default workflow(
  'healthyrobot-line-notion-rag-gemini-fallback-draft',
  '健康陪跑員｜Gemini＋Notion 無模型備援（未發布草稿）',
)
  .add(draftNote)
  .add(lineWebhook)
  .to(prepareLineMessage)
  .to(listRagPages)
  .to(selectBestPage)
  .to(readRagPage)
  .to(assembleContext)
  .to(geminiReply)
  .to(chooseReply)
  .to(lineReply);
