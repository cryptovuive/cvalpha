// ===================================================
// Twitter Auto Reply - Background Service Worker
// v1.2.0 — Smart human-like replies with context awareness
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
  maxDailyReplies: 100,
  delayMin: 60,
  delayMax: 120,
  maxTweetsToScan: 15,
  skipReplies: true,
  skipOwnReplies: true,
  blacklistKeywords: [],
  replyTemplate: '',
  systemPrompt: '',
  prioritizeSamePost: true,
  humanTyping: true,
  smartSkip: true,              // skip comment không cần reply
  humanImperfections: true,     // thêm typo, filler words
  smartTiming: true,            // delay thông minh theo context
  skipChance: 0.12,             // 12% chance bỏ qua (giống người thật)
  stats: {
    totalReplies: 0,
    todayReplies: 0,
    lastReplyDate: null,
    errors: 0
  },
  repliedTweetIds: [],
  myTweets: [],
  commentQueue: [],
  recentStyles: [],             // track 10 style gần nhất
  activityLogs: []
};

let config = { ...DEFAULT_CONFIG };
let processingQueue = false;
let myUsername = '';
let hourlyReplyTimestamps = [];  // track thời gian reply trong giờ

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
  chrome.alarms.create('scanMyTweets', { periodInMinutes: 5 });
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
          const reply = await generateAIReply(msg.comment, msg.tweetContext, msg.options);
          sendResponse({ reply });
          break;
        }

        case 'updateMyTweets': {
          const newTweets = msg.tweets || [];
          if (newTweets.length === 0) {
            sendResponse({ success: false, reason: 'No tweets found' });
            return;
          }

          if (msg.username) myUsername = msg.username;
          if (msg.displayName) config.myDisplayName = msg.displayName;

          const existingIds = new Set(config.myTweets.map(t => t.tweetId));
          let added = 0;
          for (const tweet of newTweets) {
            if (!existingIds.has(tweet.tweetId)) {
              config.myTweets.push(tweet);
              added++;
            }
          }

          config.myTweets.sort((a, b) => (b.time || 0) - (a.time || 0));
          config.myTweets = config.myTweets.slice(0, config.maxTweetsToScan);

          await saveConfig();
          notifySidePanel('info', `📰 Tìm thấy ${added} bài mới. Tổng: ${config.myTweets.length} bài`);
          sendResponse({ success: true, total: config.myTweets.length, added });
          break;
        }

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

          // ===== SMART SKIP — bỏ qua comment không cần reply =====
          if (config.smartSkip && shouldSkipComment(msg.comment, msg.username)) {
            sendResponse({ success: false, reason: 'Smart skip: not worth replying' });
            return;
          }

          // ===== RANDOM SKIP — thỉnh thoảng bỏ qua như người thật =====
          if (config.skipChance > 0 && Math.random() < config.skipChance) {
            sendResponse({ success: false, reason: 'Random skip (human behavior)' });
            return;
          }

          config.commentQueue.push({
            tweetId: msg.tweetId,
            commentId: msg.commentId,
            comment: msg.comment,
            username: msg.username || '',
            tweetTime: msg.tweetTime || 0,
            retries: 0
          });

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
            myDisplayName: config.myDisplayName || '',
            hourlyCount: getHourlyReplyCount()
          });
          break;

        case 'clearStats':
          config.stats = { ...DEFAULT_CONFIG.stats };
          config.repliedTweetIds = [];
          hourlyReplyTimestamps = [];
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
// Smart Skip — bỏ qua comment không cần reply
// ===================================================

function shouldSkipComment(comment, username) {
  const text = comment.trim();
  const lower = text.toLowerCase();

  // 1. Comment quá ngắn (chỉ emoji, "nice", "ok", "same")
  const ultraShort = /^(nice|ok|ok bro|same|good|great|wow|cool|fire|based|ngl|fr|real|fax|true|đúng|v|yes|yep|nope|nah|lol|lmao|😂|🔥|💀|❤️|💯|👀|🚀|✅|🫡|💪|🗿|✨)+[!.]*$/i;
  if (ultraShort.test(text)) return true;

  // 2. Comment chỉ có emoji
  const emojiOnly = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]+$/u;
  if (emojiOnly.test(text)) return true;

  // 3. Comment tag người khác (không phải hỏi mình)
  const tagPattern = /@\w+/g;
  const tags = text.match(tagPattern);
  if (tags && tags.length >= 2 && !text.includes('?')) return true;

  // 4. Comment quá dài (> 500 chữ) — thường là bài viết riêng, không cần reply
  if (text.length > 500) return true;

  // 5. Comment chỉ là link
  if (/^https?:\/\/\S+$/.test(text)) return true;

  // 6. Comment là reply kiểu "đang replying to @xxx" (không có nội dung mới)
  if (/^replying to @\w+$/i.test(text.trim())) return true;

  // 7. Comment có vẻ là bot / automated
  const botPatterns = /^(follow back|follow4follow|f4f|l4l|check dm|dm me|join my|subscribe|follow me)/i;
  if (botPatterns.test(text)) return true;

  return false;
}

// ===================================================
// Comment Analysis — phân tích loại comment
// ===================================================

function analyzeComment(comment, tweetContext = '') {
  const text = comment.toLowerCase().trim();
  const combined = (tweetContext + ' ' + comment).toLowerCase();

  // Detect sentiment
  const positiveWords = ['pump', 'moon', 'bullish', 'good', 'great', 'amazing', 'tốt', 'tuyệt', 'hay', 'love', 'best', 'x2', 'x10', 'profit', 'lãi', 'đúng', 'chuẩn', 'nice', 'fire', 'based'];
  const negativeWords = ['dump', 'crash', 'bear', 'bad', 'scam', 'rug', 'xấu', 'tệ', 'lỗ', 'loss', 'red', 'blood', 'sai', 'fake', 'lừa'];
  const questionIndicators = ['what', 'how', 'why', 'when', 'where', 'gì', 'sao', 'như thế nào', 'tại sao', 'không', 'chứ', '?'];

  let sentiment = 'neutral';
  const posCount = positiveWords.filter(w => text.includes(w)).length;
  const negCount = negativeWords.filter(w => text.includes(w)).length;
  if (posCount > negCount) sentiment = 'positive';
  else if (negCount > posCount) sentiment = 'negative';

  const hasQuestion = questionIndicators.some(w => text.includes(w));

  // Detect comment type
  let commentType = 'general';
  if (hasQuestion) commentType = 'question';
  else if (/^(đúng|chuẩn|exactly|right|true|100%|agree|yes|this|same|facts)/.test(text)) commentType = 'agreement';
  else if (/^(sai|wrong|no|nah|disagree|ko đồng|phản đối)/.test(text)) commentType = 'disagreement';
  else if (/lol|lmao|😂|💀|haha|vui|funny|buồn cười/.test(text)) commentType = 'humor';
  else if (/spam|ads|quảng cáo|buy now|free|airdrop|giveaway/.test(text)) commentType = 'spam';
  else if (/thank|cảm ơn|thanks|ty|tks/.test(text)) commentType = 'gratitude';

  // Detect language
  const vietnameseChars = /[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựýỳỷỹỵ]/;
  const hasVietnamese = vietnameseChars.test(comment);
  const hasEnglish = /\b(the|is|are|was|were|have|has|been|will|would|could|should|this|that|with|from)\b/i.test(comment);

  let detectedLanguage = config.replyLanguage || 'vi';
  if (hasVietnamese && !hasEnglish) detectedLanguage = 'vi';
  else if (hasEnglish && !hasVietnamese) detectedLanguage = 'en';
  else if (hasVietnamese && hasEnglish) detectedLanguage = 'mixed';

  // Comment length category
  const lengthCategory = text.length < 30 ? 'short' : text.length < 100 ? 'medium' : 'long';

  return { sentiment, hasQuestion, commentType, detectedLanguage, lengthCategory };
}

// ===================================================
// Human Text Variation — làm text tự nhiên hơn
// ===================================================

function applyHumanVariation(text, options = {}) {
  if (!config.humanImperfections) return text;

  let result = text;

  // 1. Thỉnh thoảng viết thường đầu câu (20% chance)
  if (Math.random() < 0.20 && result.length > 0) {
    result = result.charAt(0).toLowerCase() + result.slice(1);
  }

  // 2. Thêm filler words (15% chance)
  const fillers = {
    vi: ['à', 'mà', 'ơ', 'à ừ', 'mà thôi', 'thì', 'kiểu như', 'nói chung là', 'thực ra thì', 'ủa mà'],
    en: ['honestly', 'ngl', 'tbf', 'like', 'I mean', 'tho', 'btw', 'lowkey']
  };
  if (Math.random() < 0.15) {
    const lang = options.language || 'vi';
    const langFillers = fillers[lang] || fillers.vi;
    const filler = langFillers[Math.floor(Math.random() * langFillers.length)];

    // Chèn filler vào đầu hoặc giữa câu
    if (Math.random() < 0.5) {
      result = filler + ', ' + result.charAt(0).toLowerCase() + result.slice(1);
    } else {
      const words = result.split(' ');
      if (words.length > 3) {
        const pos = Math.floor(Math.random() * (words.length - 2)) + 1;
        words.splice(pos, 0, filler);
        result = words.join(' ');
      }
    }
  }

  // 3. Viết tắt tự nhiên (10% chance)
  const abbreviations = {
    'không': 'ko', 'vâng': 'v', 'chắc chắn': 'chắc lun', 'thật sự': 'thật sự luôn',
    'được không': 'đc ko', 'như vậy': 'như v', 'tại sao': 'tại sao v',
    'because': 'cuz', 'something': 'smth', 'probably': 'prob', 'definitely': 'def',
    'though': 'tho', 'between': 'btwn', 'before': 'b4'
  };
  if (Math.random() < 0.10) {
    for (const [full, abbr] of Object.entries(abbreviations)) {
      if (result.toLowerCase().includes(full) && Math.random() < 0.5) {
        result = result.replace(new RegExp(full, 'i'), abbr);
      }
    }
  }

  // 4. Thay đổi dấu câu (15% chance thiếu dấu cuối)
  if (Math.random() < 0.15 && /[.!?]$/.test(result)) {
    result = result.slice(0, -1);
  }

  // 5. Thêm "..." thay vì "." (8% chance)
  if (Math.random() < 0.08 && result.endsWith('.')) {
    result = result.slice(0, -1) + '...';
  }

  // 6. Emoji variation
  if (Math.random() < 0.25) {
    // 25% chance xóa emoji cuối (trông tự nhiên hơn, không phải lúc nào cũng có emoji)
    result = result.replace(/\s*[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]+$/u, '');
  }

  return result.trim();
}

// ===================================================
// Style Selection — thông minh, tránh lặp
// ===================================================

const REPLY_STYLES = [
  {
    id: 'hype_bullish', name: '🔥 Hype & Bullish',
    trigger: { keywords: ['pump', 'bullish', 'moon', 'ATH', 'breakout', 'surge', 'rally', 'tăng', 'x2', 'x10', 'gem', 'alpha'] },
    prompt: 'Phong cách: Hype & Bullish. Nhiệt tình, tạo năng lượng tích cực. Dùng emoji 🚀🔥💪. Ngắn gọn, punchy.'
  },
  {
    id: 'analysis', name: '📊 Phân tích',
    trigger: { keywords: ['analysis', 'data', 'research', 'TVL', 'on-chain', 'metrics', 'tokenomics', 'phân tích', 'revenue'] },
    prompt: 'Phong cách: Phân tích chuyên sâu. Đưa luận điểm rõ ràng, có dẫn chứng. Dùng emoji 📊📈🔍💡.'
  },
  {
    id: 'meme_funny', name: '😂 Hài hước / Meme',
    trigger: { keywords: ['lol', 'lmao', 'degen', 'ape', 'ser', 'fren', 'gm', 'vibe', 'mood', 'ngu', 'stupid'] },
    prompt: 'Phong cách: Hài hước, meme, relatable. Vui tính, dí dỏm. Dùng emoji 😂💀🤣. Slang CT: "ser", "fren", "anon".'
  },
  {
    id: 'ask_question', name: '❓ Đặt câu hỏi',
    trigger: { keywords: ['what', 'how', 'why', 'thoughts', 'opinion', 'think', 'suy nghĩ', 'nghĩ gì', '?'] },
    prompt: 'Phong cách: Đặt câu hỏi thông minh. Tạo thảo luận, tăng engagement. Dùng emoji 🤔💭❓👀.'
  },
  {
    id: 'supportive', name: '🤝 Ủng hộ',
    trigger: { keywords: ['agree', 'exactly', 'right', 'correct', 'đúng', 'chuẩn', 'this', '100%'] },
    prompt: 'Phong cách: Ủng hộ, đồng tình. Thêm lý do hoặc góc nhìn bổ sung. Dùng emoji ✅💯🤝🫡.'
  },
  {
    id: 'alpha_insight', name: '💎 Alpha / Insight',
    trigger: { keywords: ['alpha', 'early', 'undervalued', 'hidden', 'gem', 'sleeping', 'whale', 'smart money'] },
    prompt: 'Phong cách: Alpha/Insight. Chia sẻ thông tin giá trị, subtle. Dùng emoji 💎👀🧠🔬.'
  },
  {
    id: 'professional', name: '💼 Chuyên nghiệp',
    trigger: { keywords: ['regulation', 'compliance', 'institutional', 'adoption', 'partnership', 'SEC', 'ETF', 'stablecoin', 'infrastructure'] },
    prompt: 'Phong cách: Chuyên nghiệp, institutional. Lịch sự, có trọng lượng. Dùng emoji 💼🏢📈🏛️.'
  },
  {
    id: 'community', name: '🫂 Cộng đồng',
    trigger: { keywords: ['community', 'team', 'together', 'build', 'cộng đồng', 'anh em', 'fam', 'frens'] },
    prompt: 'Phong cách: Cộng đồng, thân thiện. Gần gũi, ấm áp. Dùng emoji 🫂❤️🙏💪.'
  },
  {
    id: 'skeptical', name: '⚠️ Cảnh báo',
    trigger: { keywords: ['risk', 'careful', 'scam', 'rug', 'fake', 'suspicious', 'cẩn thận', 'lừa đảo', 'red flag'] },
    prompt: 'Phong cách: Cảnh báo, skeptical. Cẩn thận, đặt câu hỏi nghi vấn. Dùng emoji ⚠️🚩🧐🔍.'
  },
  {
    id: 'minimal_gm', name: '✨ Minimal / GM',
    trigger: { keywords: ['gm', 'gn', 'vibes', 'energy', 'based', 'chad', 'w', 'massive', 'huge', 'insane'] },
    prompt: 'Phong cách: Minimal, GM energy. Rất ngắn, 1-3 từ + emoji. Dùng emoji ✨🫡🙌💪🔥.'
  }
];

function selectBestStyle(tweetText, commentText, analysis) {
  const combined = (tweetText + ' ' + commentText).toLowerCase();
  const scores = [];

  // Phân tích comment type để ưu tiên style phù hợp
  const typeStyleBoost = {
    question: { ask_question: 5 },
    agreement: { supportive: 5, hype_bullish: 3 },
    disagreement: { skeptical: 5, analysis: 3 },
    humor: { meme_funny: 5, minimal_gm: 3 },
    gratitude: { supportive: 5, community: 3 },
    spam: {} // sẽ skip trước đó
  };

  const boosts = typeStyleBoost[analysis?.commentType] || {};

  for (const style of REPLY_STYLES) {
    let score = boosts[style.id] || 0;

    for (const kw of style.trigger.keywords) {
      if (combined.includes(kw.toLowerCase())) score += 2;
    }

    scores.push({ style, score });
  }

  // Tránh lặp style — giảm score của style đã dùng gần đây
  const recentStyles = config.recentStyles || [];
  for (const s of scores) {
    const recentCount = recentStyles.filter(id => id === s.style.id).length;
    s.score -= recentCount * 1.5; // giảm 1.5 điểm mỗi lần dùng gần đây
  }

  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Math.random() - 0.5;
  });

  const selected = scores[0].score > 0 ? scores[0].style : REPLY_STYLES[Math.floor(Math.random() * REPLY_STYLES.length)];

  // Track recent styles (giữ 10 gần nhất)
  config.recentStyles = [...(config.recentStyles || []), selected.id].slice(-10);

  return selected;
}

// ===================================================
// Smart Timing — delay thông minh
// ===================================================

function calculateSmartDelay(commentLength, isHourPeak) {
  if (!config.smartTiming) return randomDelay();

  const min = config.delayMin || 60;
  const max = config.delayMax || 120;
  let base = Math.floor(Math.random() * (max - min + 1)) + min;

  // 1. Comment dài → delay dài hơn ("đọc kỹ rồi reply")
  if (commentLength > 200) base = Math.round(base * 1.4);
  else if (commentLength > 100) base = Math.round(base * 1.2);
  else if (commentLength < 30) base = Math.round(base * 0.7);

  // 2. Giờ cao điểm → delay ngắn hơn (nhiều người online)
  const hour = new Date().getHours();
  const peakHours = [8, 9, 10, 19, 20, 21, 22];
  if (peakHours.includes(hour)) base = Math.round(base * 0.8);

  // 3. Giờ ít người (1-6h sáng) → delay dài hơn
  if (hour >= 1 && hour <= 6) base = Math.round(base * 1.5);

  // 4. Thêm jitter ±15%
  const jitter = base * 0.15;
  base += Math.floor(Math.random() * jitter * 2 - jitter);

  return Math.max(20, base); // tối thiểu 20s
}

function getHourlyReplyCount() {
  const oneHourAgo = Date.now() - 3600000;
  hourlyReplyTimestamps = hourlyReplyTimestamps.filter(t => t > oneHourAgo);
  return hourlyReplyTimestamps.length;
}

function randomDelay() {
  const min = config.delayMin || 60;
  const max = config.delayMax || 120;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ===================================================
// Queue Sort & Process
// ===================================================

function sortQueue() {
  if (!config.prioritizeSamePost) return;

  const groups = new Map();
  for (const item of config.commentQueue) {
    const key = item.tweetId || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

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
      // Daily limit
      const maxDaily = config.maxDailyReplies || (config.maxRepliesPerHour * 24);
      if (config.stats.todayReplies >= maxDaily) {
        notifySidePanel('warning', '⚠️ Đạt giới hạn reply/ngày');
        break;
      }

      // ===== HOURLY RATE LIMIT =====
      const hourlyCount = getHourlyReplyCount();
      if (hourlyCount >= config.maxRepliesPerHour) {
        notifySidePanel('warning', `⚠️ Đạt giới hạn ${config.maxRepliesPerHour} reply/giờ. Chờ...`);
        // Đợi đến khi có slot trống
        const oldestInHour = hourlyReplyTimestamps[0];
        const waitMs = oldestInHour + 3600000 - Date.now() + 5000;
        if (waitMs > 0) await sleep(Math.min(waitMs, 300000)); // max đợi 5 phút
        continue;
      }

      const item = config.commentQueue.shift();

      // Skip nếu đã reply
      if (config.skipReplies !== false && config.repliedTweetIds.includes(item.commentId)) {
        continue;
      }

      try {
        const tweetInfo = config.myTweets.find(t => t.tweetId === item.tweetId);
        const tweetContext = tweetInfo?.text || '';

        // ===== ANALYZE COMMENT =====
        const analysis = analyzeComment(item.comment, tweetContext);

        // ===== GENERATE REPLY =====
        const reply = await generateAIReply(item.comment, tweetContext, { analysis });

        // ===== QUALITY CHECK =====
        if (isGenericReply(reply)) {
          notifySidePanel('info', `⏭️ Skip generic reply cho @${item.username}`);
          continue;
        }

        if (isDuplicateReply(reply)) {
          notifySidePanel('info', `⏭️ Skip duplicate reply cho @${item.username}`);
          continue;
        }

        // Post reply
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          const result = await chrome.tabs.sendMessage(tab.id, {
            action: 'postReply',
            tweetId: item.tweetId,
            commentId: item.commentId,
            reply: reply,
            username: item.username
          }).catch(() => null);

          // ===== QUEUE RETRY — nếu postReply fail =====
          if (result && !result.success && (item.retries || 0) < 2) {
            item.retries = (item.retries || 0) + 1;
            config.commentQueue.unshift(item); // đưa lại đầu queue
            notifySidePanel('warning', `🔄 Retry #${item.retries} cho @${item.username}`);
            await sleep(5000);
            continue;
          }
        }

        // Notify
        chrome.runtime.sendMessage({
          action: 'replyPosted',
          username: item.username,
          reply: reply,
          tweetId: item.tweetId,
          analysis: analysis
        }).catch(() => {});

        // Stats
        config.stats.totalReplies++;
        config.stats.todayReplies++;
        config.stats.lastReplyDate = new Date().toDateString();
        config.repliedTweetIds.push(item.commentId);
        hourlyReplyTimestamps.push(Date.now());

        if (config.repliedTweetIds.length > 2000) {
          config.repliedTweetIds = config.repliedTweetIds.slice(-1000);
        }
        await saveConfig();

        chrome.runtime.sendMessage({
          action: 'statsUpdate',
          stats: config.stats,
          queue: config.commentQueue.length,
          tweets: config.myTweets.length,
          hourlyCount: getHourlyReplyCount()
        }).catch(() => {});

        // ===== SMART DELAY =====
        if (config.commentQueue.length > 0) {
          const delaySec = calculateSmartDelay(item.comment.length);
          const nextItem = config.commentQueue[0];
          const samePost = (item.tweetId === nextItem?.tweetId);

          notifySidePanel('info',
            samePost
              ? `⏳ Chờ ${delaySec}s → reply tiếp cùng bài...`
              : `⏳ Chờ ${delaySec}s → chuyển sang bài khác...`
          );

          await sleep(delaySec * 1000);
        }

      } catch (err) {
        // AI skipped → không phải lỗi thật
        if (err.message === 'AI skipped') {
          notifySidePanel('info', `⏭️ AI bỏ qua comment của @${item.username}`);
          continue;
        }

        config.stats.errors++;
        await saveConfig();
        chrome.runtime.sendMessage({ action: 'replyError', error: err.message }).catch(() => {});
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

// ===================================================
// Reply Quality Filter
// ===================================================

function isGenericReply(reply) {
  const generic = [
    /^(good point|nice|great|interesting|agree|true|facts|this|same)[!.]*$/i,
    /^(hay|đúng|chuẩn|tốt|tuyệt|ok|yeah)[!.]*$/i,
    /^(👍|❤️|🔥|💯|✅)[!.]*$/
  ];
  return generic.some(p => p.test(reply.trim()));
}

function isDuplicateReply(reply) {
  // Kiểm tra xem reply gần đây có giống không
  const recentReplied = config.repliedTweetIds.slice(-20);
  // (Chỉ check length và pattern cơ bản, không check exact vì mỗi reply là unique)
  return false; // Placeholder — AI đã được hướng dẫn không lặp
}

// ===================================================
// Reply Length Calculator — tính độ dài reply tối ưu
// ===================================================

function calculateReplyLength(comment, analysis) {
  const commentLen = comment.trim().length;
  const type = analysis.commentType;
  const lenCat = analysis.lengthCategory;

  // ===== BẢNG ĐỘ DÀI — NGẮN GỌN =====
  // Mục tiêu: 30-70 ký tự, lý tưởng 50-60
  //
  // Comment Type        | Ký tự Min | Ideal | Max
  // --------------------|-----------|-------|-----
  // question            |    35     |  55   |  80
  // agreement           |    15     |  35   |  55
  // disagreement        |    40     |  60   |  90
  // humor               |    10     |  30   |  50
  // gratitude           |    10     |  25   |  40
  // general             |    25     |  50   |  70

  const rules = {
    question:     { min: 35, max: 80,  ideal: 55 },
    agreement:    { min: 15, max: 55,  ideal: 35 },
    disagreement: { min: 40, max: 90,  ideal: 60 },
    humor:        { min: 10, max: 50,  ideal: 30 },
    gratitude:    { min: 10, max: 40,  ideal: 25 },
    spam:         { min: 0,  max: 0,   ideal: 0  },
    general:      { min: 25, max: 70,  ideal: 50 }
  };

  const rule = rules[type] || rules.general;

  // Comment ngắn → reply ngắn hơn
  if (lenCat === 'short') {
    rule.max = Math.min(rule.max, 55);
    rule.ideal = Math.min(rule.ideal, 40);
  }

  return rule;
}

// ===================================================
// Prompt Builder — xây dựng prompt chi tiết
// ===================================================

function buildSystemPrompt(selectedStyle, analysis, replyLang, lengthRule) {
  const langMap = {
    vi: 'Tiếng Việt', en: 'English', ja: '日本語', ko: '한국어', zh: '中文', mixed: 'Mixed Vietnamese-English'
  };

  const commentTypeGuide = {
    question: `Comment là CÂU HỎI.
- Trả lời ĐÚNG câu hỏi, không lan man
- Nếu biết → trả lời ngắn gọn, có lý do
- Nếu không chắc → nói "ko chắc nhưng mà..." hoặc "[SKIP]"
- Có thể hỏi ngược lại để tạo thảo luận`,

    agreement: `Comment ĐỒNG Ý với bài viết.
- KHÔNG chỉ nói "đúng rồi" — thêm 1 lý do hoặc góc nhìn
- Hoặc mở rộng quan điểm
- Ngắn gọn, punchy`,

    disagreement: `Comment KHÔNG ĐỒNG Ý.
- Có luận điểm rõ ràng, KHÔNG chửi bới
- "Tui ko nghĩ vậy vì..." hoặc "Mặt khác thì..."
- Lịch sự nhưng có chính kiến`,

    humor: `Comment HÀI HƯỚC / Meme.
- Reply vui, tương tác với joke
- KHÔNG nghiêm túc hóa
- Rất ngắn, witty`,

    gratitude: `Comment CẢM ƠN.
- Reply ngắn: "ko có gì", "🙏", "glad it helped"
- KHÔNG dài dòng`,

    spam: `Comment SPAM/ADS.
- TRẢ VỀ "[SKIP]" — KHÔNG reply`,

    general: `Comment bình thường.
- Reply phù hợp ngữ cảnh
- Thêm giá trị hoặc tạo thảo luận`
  };

  return `=== HỆ THỐNG COMMENT AI ===
Bạn là người dùng Twitter/X thật sự. Nhiệm vụ: reply comment trên bài viết.

═══ PHONG CÁCH ═══
${selectedStyle.name}: ${selectedStyle.prompt}

═══ NGÔN NGỮ ═══
${langMap[replyLang] || langMap.vi}
- Comment tiếng Việt → reply tiếng Việt
- Comment tiếng Anh → reply tiếng Anh
- Comment mixed → reply mixed tự nhiên
- KHÔNG ép một ngôn ngữ khi comment dùng ngôn ngữ khác

═══ LOẠI COMMENT ═══
${commentTypeGuide[analysis.commentType] || commentTypeGuide.general}

═══ GIỚI HẠN KÝ TỰ (QUAN TRỌNG NHẤT) ═══
- TỐI THIỂU: ${lengthRule.min} ký tự
- LÝ TƯỞNG: ${lengthRule.ideal} ký tự
- TỐI ĐA: ${lengthRule.max} ký tự (KHÔNG được vượt quá)
- TUYỆT ĐỐI KHÔNG vượt quá 280 ký tự (Twitter limit)

⚠️ NGUYÊN TẮC NGẮN GỌN:
- Reply loanh quanh 30-60 ký tự. KHÔNG dài dòng.
- 1-2 câu là đủ. Nhiều nhất 3 câu.
- Comment ngắn → reply ngắn. Không cần elaborate.
- Thà ngắn mà chất, hơn dài mà nhạt.
- Nếu không có gì hay → "[SKIP]"

═══ TỰ NHIÊN NHƯ NGƯỜI THẬT ═══
Viết như đang chat với bạn bè, KHÔNG như essay:
- Viết tắt thỉnh thoảng: "ko" "đc" "v" "btw" "ngl"
- Filler words: "à" "mà" "thì" "ơ" "hmm"
- Thỉnh thoảng thiếu dấu câu cuối
- Có thể viết thường đầu câu
- Emoji tự nhiên (60% có, 25% không, 15% nhiều)
- KHÔNG bắt đầu bằng: "Great question!", "Interesting!", "Good point!"
- KHÔNG dùng: "As an AI", "I think", "In my opinion"
- KHÔNG quá politically correct
- Có thể có opinion, có thể不同意

═══ ON-TOPIC RULES ═══
- Reply PHẢI liên quan đến comment và bài viết
- KHÔNG lái sang chủ đề khác
- KHÔNG thêm thông tin không liên quan
- Nếu comment hỏi về X → trả lời về X, KHÔNG nói về Y
- Nếu không có gì hay để nói → "[SKIP]"

═══ SKIP RULES ═══
Trả về "[SKIP]" nếu:
- Comment spam/ads/quảng cáo
- Comment quá vô nghĩa
- Không có gì giá trị để reply
- Comment tag người khác (không phải hỏi mình)

═══ OUTPUT ═══
Trả về CHỈ nội dung reply. Không giải thích. Không markdown. Không quotes.`;
}

// ===================================================
// AI Reply Generation
// ===================================================

async function generateAIReply(comment, tweetContext = '', options = {}) {
  if (!config.openaiApiKey) throw new Error('API key not configured');

  const analysis = options.analysis || analyzeComment(comment, tweetContext);

  // Skip spam
  if (analysis.commentType === 'spam') throw new Error('AI skipped');

  const selectedStyle = selectBestStyle(tweetContext, comment, analysis);
  const replyLang = analysis.detectedLanguage || config.replyLanguage || 'vi';
  const lengthRule = calculateReplyLength(comment, analysis);

  const systemPrompt = buildSystemPrompt(selectedStyle, analysis, replyLang, lengthRule);

  const userMessage = tweetContext
    ? `Bài viết: "${tweetContext.substring(0, 200)}"\nComment của @${options.username || 'user'}: "${comment}"`
    : `Comment: "${comment}"`;

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
      max_tokens: 120,
      temperature: 0.85
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API error: ${response.status} - ${error.error?.message || 'Unknown'}`);
  }

  const data = await response.json();
  let reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('Empty response');
  if (reply === '[SKIP]') throw new Error('AI skipped');

  // ===== POST-GENERATION VALIDATION =====

  // 1. Nếu quá dài → cắt thông minh (tại ranh giới câu)
  if (reply.length > lengthRule.max) {
    // Tìm dấu câu gần nhất trước limit
    const cutPoint = findCutPoint(reply, lengthRule.max);
    reply = reply.substring(0, cutPoint).trim();
  }

  // 2. Nếu quá ngắn và không phải minimal style → bỏ qua
  if (reply.length < lengthRule.min && selectedStyle.id !== 'minimal_gm') {
    // Quá ngắn, thử tạo lại hoặc skip
    if (reply.length < 10) throw new Error('AI skipped');
  }

  // 3. Nếu vượt 280 ký tự → cắt
  if (reply.length > 280) {
    const cutPoint = findCutPoint(reply, 277);
    reply = reply.substring(0, cutPoint).trim() + '...';
  }

  // ===== APPLY HUMAN VARIATION =====
  reply = applyHumanVariation(reply, { language: replyLang });

  // Final length check
  if (reply.length > 280) reply = reply.substring(0, 280);

  notifySidePanel('info', `🎨 ${selectedStyle.name} | ${analysis.commentType} | ${reply.length}/${lengthRule.max} chars`);

  return reply;
}

// Tìm vị trí cắt thông minh (tại ranh giới câu/từ)
function findCutPoint(text, maxLen) {
  if (text.length <= maxLen) return text.length;

  // Tìm dấu câu gần nhất trước limit
  const punctuation = ['. ', '! ', '? ', '… ', '.\n', '!\n', '?\n'];
  let bestCut = maxLen;

  for (const p of punctuation) {
    const idx = text.lastIndexOf(p, maxLen);
    if (idx > maxLen * 0.5) { // Không cắt quá ngắn (>50% limit)
      bestCut = Math.min(bestCut, idx + p.length);
    }
  }

  // Nếu không tìm thấy dấu câu → cắt tại ranh giới từ
  if (bestCut === maxLen) {
    const lastSpace = text.lastIndexOf(' ', maxLen);
    if (lastSpace > maxLen * 0.6) bestCut = lastSpace;
  }

  return bestCut;
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
