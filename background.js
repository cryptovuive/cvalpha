// ===================================================
// Twitter Auto Reply - Background Service Worker
// Logic: Scan 15 newest tweets → prioritize newest → random reply
// ===================================================

const DEFAULT_CONFIG = {
  enabled: false,
  openaiApiKey: '',
  openaiModel: 'gpt-5.4-mini',
  openaiBaseUrl: 'https://api.openai.com/v1',
  replyTone: 'friendly',
  customTone: '',
  replyLanguage: 'vi',
  maxRepliesPerHour: 10,
  delayMin: 60,
  delayMax: 120,
  maxTweetsToScan: 15,          // quét 15 bài mới nhất
  skipReplies: true,
  skipOwnReplies: true,
  blacklistKeywords: [],
  replyTemplate: '',
  prioritizeSamePost: true,       // ưu tiên hết comment cùng bài trước
  stats: {
    totalReplies: 0,
    todayReplies: 0,
    lastReplyDate: null,
    errors: 0
  },
  repliedTweetIds: [],
  myTweets: [],                 // [{ tweetId, text, time, commentCount }]
  commentQueue: []              // [{ tweetId, commentId, comment, username, tweetTime }]
};

let config = { ...DEFAULT_CONFIG };
let processingQueue = false;
let myUsername = '';             // sẽ tự detect từ config hoặc content script

// ---- Init ----
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('config');
  if (stored.config) {
    config = { ...DEFAULT_CONFIG, ...stored.config };
    myUsername = config.myUsername || '';
  } else {
    await chrome.storage.local.set({ config });
  }
  chrome.alarms.create('resetDaily', { periodInMinutes: 60 });
  chrome.alarms.create('processQueue', { periodInMinutes: 1 });
  chrome.alarms.create('scanMyTweets', { periodInMinutes: 5 }); // scan mỗi 5 phút
});

chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.local.get('config');
  if (stored.config) {
    config = { ...DEFAULT_CONFIG, ...stored.config };
    myUsername = config.myUsername || '';
  }
});

// ---- Alarms ----
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'resetDaily') {
    const today = new Date().toDateString();
    if (config.stats.lastReplyDate !== today) {
      config.stats.todayReplies = 0;
      config.stats.lastReplyDate = today;
      await saveConfig();
    }
  }
  if (alarm.name === 'processQueue') {
    await processQueue();
  }
  if (alarm.name === 'scanMyTweets') {
    // Yêu cầu content script scan bài viết mới
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'scanMyTweets' }).catch(() => {});
    }
  }
});

// ---- Message Handler ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {
        case 'getConfig':
          sendResponse({ config });
          break;

        case 'saveConfig':
          config = { ...config, ...msg.data };
          await saveConfig();
          sendResponse({ success: true });
          break;

        case 'generateReply': {
          const reply = await generateAIReply(msg.comment, msg.tweetContext);
          sendResponse({ reply });
          break;
        }

        // Content script gửi danh sách tweet mới tìm được
        case 'updateMyTweets': {
          const newTweets = msg.tweets || [];
          if (newTweets.length === 0) {
            sendResponse({ success: false, reason: 'No tweets found' });
            return;
          }

          // Cập nhật username & display name
          if (msg.username) myUsername = msg.username;
          if (msg.displayName) config.myDisplayName = msg.displayName;

          // Merge: thêm tweet mới, giữ tweet cũ, giới hạn 15
          const existingIds = new Set(config.myTweets.map(t => t.tweetId));
          let added = 0;
          for (const tweet of newTweets) {
            if (!existingIds.has(tweet.tweetId)) {
              config.myTweets.push(tweet);
              added++;
            }
          }

          // Sắp xếp theo thời gian mới nhất, giữ tối đa 15
          config.myTweets.sort((a, b) => (b.time || 0) - (a.time || 0));
          config.myTweets = config.myTweets.slice(0, config.maxTweetsToScan);

          await saveConfig();

          // Notify side panel
          notifySidePanel('info',
            `📰 Tìm thấy ${added} bài mới. Tổng: ${config.myTweets.length} bài đang theo dõi`
          );

          sendResponse({ success: true, total: config.myTweets.length, added });
          break;
        }

        // Content script gửi comment mới tìm được
        case 'queueComment': {
          if (!config.enabled) {
            sendResponse({ success: false, reason: 'Extension disabled' });
            return;
          }
          if (config.repliedTweetIds.includes(msg.commentId)) {
            sendResponse({ success: false, reason: 'Already replied' });
            return;
          }
          if (config.commentQueue.some(c => c.commentId === msg.commentId)) {
            sendResponse({ success: false, reason: 'Already in queue' });
            return;
          }
          if (hasBlacklistedKeyword(msg.comment)) {
            sendResponse({ success: false, reason: 'Blacklisted' });
            return;
          }

          config.commentQueue.push({
            tweetId: msg.tweetId,
            commentId: msg.commentId,
            comment: msg.comment,
            username: msg.username || '',
            tweetTime: msg.tweetTime || 0
          });

          // Sort queue: ưu tiên bài mới nhất
          sortQueue();

          await saveConfig();
          await processQueue();
          sendResponse({ success: true });
          break;
        }

        case 'accountDetected': {
          if (msg.username) {
            myUsername = msg.username;
            config.myUsername = msg.username;
          }
          if (msg.displayName) config.myDisplayName = msg.displayName;
          await saveConfig();
          sendResponse({ success: true });
          break;
        }

        case 'getStats':
          sendResponse({
            stats: config.stats,
            queue: config.commentQueue?.length || 0,
            tweets: config.myTweets?.length || 0,
            myUsername,
            myDisplayName: config.myDisplayName || ''
          });
          break;

        case 'clearStats':
          config.stats = { ...DEFAULT_CONFIG.stats };
          config.repliedTweetIds = [];
          await saveConfig();
          sendResponse({ success: true });
          break;

        case 'testApiKey': {
          const result = await testApiKey(msg.apiKey, msg.baseUrl);
          sendResponse(result);
          break;
        }

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();
  return true;
});

// ===================================================
// Queue Sort & Process
// ===================================================

function sortQueue() {
  if (!config.prioritizeSamePost) return;

  // Ưu tiên comment trong cùng bài viết trước (group by tweetId)
  // Trong mỗi group, giữ nguyên thứ tự (FIFO)
  const groups = new Map();
  for (const item of config.commentQueue) {
    const key = item.tweetId || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  // Sắp xếp group theo tweetTime giảm dần (bài mới nhất trước)
  const sortedGroups = Array.from(groups.entries())
    .sort(([, a], [, b]) => ((b[0]?.tweetTime || 0) - (a[0]?.tweetTime || 0)));

  config.commentQueue = sortedGroups.flatMap(([, items]) => items);
}

async function processQueue() {
  if (processingQueue || config.commentQueue.length === 0) return;
  if (!config.enabled || !config.openaiApiKey) return;

  processingQueue = true;
  try {
    while (config.commentQueue.length > 0) {
      const maxDaily = config.maxDailyReplies || (config.maxRepliesPerHour * 24);
      if (config.stats.todayReplies >= maxDaily) {
        notifySidePanel('warning', '⚠️ Đạt giới hạn reply/ngày');
        break;
      }

      const item = config.commentQueue.shift();

      // Skip nếu đã reply (dựa trên repliedTweetIds)
      if (config.skipReplies !== false && config.repliedTweetIds.includes(item.commentId)) {
        continue;
      }

      try {
        const tweetInfo = config.myTweets.find(t => t.tweetId === item.tweetId);
        const tweetContext = tweetInfo?.text || '';

        const reply = await generateAIReply(item.comment, tweetContext);

        // Gửi content script post reply
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'postReply',
            tweetId: item.tweetId,
            commentId: item.commentId,
            reply: reply,
            username: item.username
          });
        }

        // Notify
        chrome.runtime.sendMessage({
          action: 'replyPosted',
          username: item.username,
          reply: reply,
          tweetId: item.tweetId
        }).catch(() => {});

        // Stats
        config.stats.totalReplies++;
        config.stats.todayReplies++;
        config.stats.lastReplyDate = new Date().toDateString();
        config.repliedTweetIds.push(item.commentId);
        if (config.repliedTweetIds.length > 2000) {
          config.repliedTweetIds = config.repliedTweetIds.slice(-1000);
        }
        await saveConfig();

        chrome.runtime.sendMessage({
          action: 'statsUpdate',
          stats: config.stats,
          queue: config.commentQueue.length,
          tweets: config.myTweets.length
        }).catch(() => {});

        // ===== RANDOM DELAY =====
        if (config.commentQueue.length > 0) {
          const delaySec = randomDelay();

          // Xem comment tiếp theo cùng bài hay khác bài
          const nextItem = config.commentQueue[0];
          const samePost = (item.tweetId === nextItem.tweetId);

          notifySidePanel('info',
            samePost
              ? `⏳ Chờ ${delaySec}s → reply tiếp cùng bài...`
              : `⏳ Chờ ${delaySec}s → chuyển sang bài khác...`
          );

          await sleep(delaySec * 1000);
        }

      } catch (err) {
        config.stats.errors++;
        await saveConfig();
        chrome.runtime.sendMessage({
          action: 'replyError',
          error: err.message
        }).catch(() => {});
        console.error('[AutoReply] Error:', err);

        if (config.commentQueue.length > 0) {
          await sleep(randomDelay() * 1000);
        }
      }
    }
  } finally {
    processingQueue = false;
  }
}

function randomDelay() {
  const min = config.delayMin || 60;
  const max = config.delayMax || 120;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---- AI Reply ----

// Reply Styles (từ reply-styles.js)
const REPLY_STYLES = [
  {
    id: 'hype_bullish',
    name: '🔥 Hype & Bullish',
    trigger: { keywords: ['pump', 'bullish', 'moon', 'ATH', 'breakout', 'surge', 'rally', 'tăng', 'x2', 'x10', 'gem', 'alpha'], sentiment: 'positive' },
    prompt: 'Phong cách: Hype & Bullish. Nhiệt tình, tạo năng lượng tích cực. Dùng emoji 🚀🔥💪. Ngắn gọn, punchy. Ví dụ: "LFG! WAGMI 🚀", "Bullish af on this one 🔥"'
  },
  {
    id: 'analysis',
    name: '📊 Phân tích',
    trigger: { keywords: ['analysis', 'data', 'research', 'TVL', 'on-chain', 'metrics', 'tokenomics', 'phân tích', 'revenue'], sentiment: 'neutral' },
    prompt: 'Phong cách: Phân tích chuyên sâu. Đưa luận điểm rõ ràng, có dẫn chứng. Dùng emoji 📊📈🔍💡. Ví dụ: "TVL up 40% but token undervalued. On-chain shows whale accumulation 📊"'
  },
  {
    id: 'meme_funny',
    name: '😂 Hài hước / Meme',
    trigger: { keywords: ['lol', 'lmao', 'degen', 'ape', 'ser', 'fren', 'gm', 'vibe', 'mood', 'ngu', 'stupid'], sentiment: 'any' },
    prompt: 'Phong cách: Hài hước, meme, relatable. Vui tính, dí dỏm. Dùng emoji 😂💀🤣. Slang CT: "ser", "fren", "anon", "ngmi". Ví dụ: "Ser this is a Wendy\'s 💀", "Average degen behavior 😂"'
  },
  {
    id: 'ask_question',
    name: '❓ Đặt câu hỏi',
    trigger: { keywords: ['what', 'how', 'why', 'thoughts', 'opinion', 'think', 'suy nghĩ', 'nghĩ gì', '?'], sentiment: 'any' },
    prompt: 'Phong cách: Đặt câu hỏi thông minh. Tạo thảo luận, tăng engagement. Dùng emoji 🤔💭❓👀. Ví dụ: "What\'s your take on this? 🤔", "Ser, sustainable or just hype? 💭"'
  },
  {
    id: 'supportive',
    name: '🤝 Ủng hộ',
    trigger: { keywords: ['agree', 'exactly', 'right', 'correct', 'đúng', 'chuẩn', 'this', '100%'], sentiment: 'positive' },
    prompt: 'Phong cách: Ủng hộ, đồng tình. Thêm lý do hoặc góc nhìn bổ sung. Dùng emoji ✅💯🤝🫡. Ví dụ: "This. Exactly this ✅", "100% agree. Been saying this for months 💯"'
  },
  {
    id: 'alpha_insight',
    name: '💎 Alpha / Insight',
    trigger: { keywords: ['alpha', 'early', 'undervalued', 'hidden', 'gem', 'sleeping', 'whale', 'smart money'], sentiment: 'positive' },
    prompt: 'Phong cách: Alpha/Insight. Chia sẻ thông tin giá trị, subtle. Dùng emoji 💎👀🧠🔬. Ví dụ: "On-chain tells a different story 👀", "Smart money accumulating quietly. DYOR 💎"'
  },
  {
    id: 'professional',
    name: '💼 Chuyên nghiệp',
    trigger: { keywords: ['regulation', 'compliance', 'institutional', 'adoption', 'partnership', 'SEC', 'ETF', 'stablecoin', 'infrastructure'], sentiment: 'neutral' },
    prompt: 'Phong cách: Chuyên nghiệp, institutional. Lịch sự, có trọng lượng. Dùng emoji 💼🏢📈🏛️. Ví dụ: "Important milestone. Institutional adoption accelerating 🏛️"'
  },
  {
    id: 'community',
    name: '🫂 Cộng đồng',
    trigger: { keywords: ['community', 'team', 'together', 'build', 'cộng đồng', 'anh em', 'fam', 'frens'], sentiment: 'positive' },
    prompt: 'Phong cách: Cộng đồng, thân thiện. Gần gũi, ấm áp. Dùng emoji 🫂❤️🙏💪. Ví dụ: "This is why I love this community 🫂", "We\'re all gonna make it together fam 💪"'
  },
  {
    id: 'skeptical',
    name: '⚠️ Cảnh báo',
    trigger: { keywords: ['risk', 'careful', 'scam', 'rug', 'fake', 'suspicious', 'cẩn thận', 'lừa đảo', 'red flag'], sentiment: 'negative' },
    prompt: 'Phong cách: Cảnh báo, skeptical. Cẩn thận, đặt câu hỏi nghi vấn. Dùng emoji ⚠️🚩🧐🔍. Ví dụ: "Red flags everywhere. DYOR ⚠️", "Sounds too good to be true 🧐"'
  },
  {
    id: 'minimal_gm',
    name: '✨ Minimal / GM',
    trigger: { keywords: ['gm', 'gn', 'vibes', 'energy', 'based', 'chad', 'w', 'massive', 'huge', 'insane'], sentiment: 'positive' },
    prompt: 'Phong cách: Minimal, GM energy. Rất ngắn, 1-3 từ + emoji. Dùng emoji ✨🫡🙌💪🔥. Ví dụ: "Based ✨", "GM king 🫡", "Massive W 🔥", "Chad energy 🗿"'
  }
];

function selectBestStyle(tweetText, commentText) {
  const combined = (tweetText + ' ' + commentText).toLowerCase();
  const scores = [];

  for (const style of REPLY_STYLES) {
    let score = 0;
    for (const kw of style.trigger.keywords) {
      if (combined.includes(kw.toLowerCase())) score += 2;
    }
    scores.push({ style, score });
  }

  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Math.random() - 0.5;
  });

  if (scores[0].score > 0) return scores[0].style;
  return REPLY_STYLES[Math.floor(Math.random() * REPLY_STYLES.length)];
}

async function generateAIReply(comment, tweetContext = '') {
  if (!config.openaiApiKey) throw new Error('API key not configured');

  // ===== AUTO STYLE SELECTION =====
  const selectedStyle = selectBestStyle(tweetContext, comment);

  const langMap = {
    vi: 'Tiếng Việt', en: 'English', ja: '日本語', ko: '한국어', zh: '中文'
  };

  const systemPrompt = `Bạn là trợ lý AI quản lý Twitter/X.
Viết reply cho comment trên bài viết của người dùng.

Phong cách được chọn: ${selectedStyle.name}
${selectedStyle.prompt}

Quy tắc chung:
- Ngôn ngữ: ${langMap[config.replyLanguage] || langMap.vi}
- Tối đa 280 ký tự
- Tự nhiên, giống người thật, KHÔNG robot
- Nếu spam/ads → "[SKIP]"
- Reply phải phù hợp với ngữ cảnh bài viết và comment
- Không lặp lại y hệt comment gốc
${config.replyTemplate ? `- Template: ${config.replyTemplate}` : ''}
${config.systemPrompt ? `\nCustom instructions: ${config.systemPrompt}` : ''}

Trả về CHỈ nội dung reply.`;

  const userMessage = tweetContext
    ? `Bài viết gốc: "${tweetContext}"\n\nComment cần reply: "${comment}"`
    : `Comment cần reply: "${comment}"`;

  const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: config.openaiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 150,
      temperature: 0.8
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API error: ${response.status} - ${error.error?.message || 'Unknown'}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('Empty response');
  if (reply === '[SKIP]') throw new Error('AI skipped');

  // Notify side panel about style used
  notifySidePanel('info', `🎨 Style: ${selectedStyle.name}`);

  return reply;
}

// ---- API Test ----
async function testApiKey(apiKey, baseUrl = 'https://api.openai.com/v1') {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (response.ok) return { success: true };
    const err = await response.json().catch(() => ({}));
    return { success: false, error: err.error?.message || `HTTP ${response.status}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ---- Helpers ----
function hasBlacklistedKeyword(text) {
  if (!config.blacklistKeywords?.length) return false;
  const lower = text.toLowerCase();
  return config.blacklistKeywords.some(kw => lower.includes(kw.toLowerCase()));
}

function notifySidePanel(type, message) {
  chrome.runtime.sendMessage({ action: 'logMessage', type, message }).catch(() => {});
}

async function saveConfig() {
  await chrome.storage.local.set({ config });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
