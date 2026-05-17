// ===================================================
// Twitter Auto Reply - Reply Styles System
// ===================================================
// Dựa trên phân tích phong cách reply của các tài khoản:
// @Crypto_He (先知)     - Trader/Analyst, tiếng Trung
// @Yiyixmb              - DeFi/Web3 KOL
// @gigiz_eth            - ETH ecosystem, 57K followers
// @wilson_              - Crypto OG, engagement king
// @momochenming         - Chinese crypto community
// @ZF_lab               - Research/Alpha group
// @VIP8888883           - Whale/VIP trader
// @thejasich            - Crypto thought leader
// @jerallaire           - CEO Circle (USDC), institutional
// @pukerrainbrow        - AI + Crypto + Memes content
// ===================================================

const REPLY_STYLES = [
  // ===== 1. HYPE & BULLISH =====
  // Kiểu @wilson_ - nhiệt tình, tạo FOMO, engagement cao
  {
    id: 'hype_bullish',
    name: '🔥 Hype & Bullish',
    description: 'Nhiệt tình, tạo năng lượng tích cực, phù hợp khi có tin tốt',
    trigger: {
      keywords: ['pump', 'bullish', 'moon', 'ATH', 'breakout', 'surge', 'rally', 'new high', 'tăng', 'x2', 'x10', 'gem', 'alpha'],
      sentiment: 'positive',
      topics: ['price_up', 'launch', 'partnership', 'milestone']
    },
    prompt: `Phong cách: Hype & Bullish
- Nhiệt tình, tạo năng lượng tích cực
- Dùng emoji: 🚀🔥💪🎯✅🙌
- Ngắn gọn, punchy, tạo FOMO
- Có thể dùng: "LFG!", "WAGMI", "GM", "ngáo ngơ chưa"
- Không quá dài, 1-2 câu là đủ
- Ví dụ: "This is just the beginning 🚀", "Bullish af on this one 🔥", "LFG! WAGMI 💪"`
  },

  // ===== 2. PHÂN TÍCH/THUYẾT TRÌNH =====
  // Kiểu @Crypto_He, @ZF_lab - chuyên sâu, có luận điểm
  {
    id: 'analysis',
    name: '📊 Phân tích / Thuyết trình',
    description: 'Có luận điểm rõ ràng, dẫn chứng, phù hợp bài phân tích',
    trigger: {
      keywords: ['analysis', 'data', 'research', 'fundamentals', 'TVL', 'tvl', 'on-chain', 'onchain', 'metrics', 'valuation', 'tokenomics', 'phân tích', 'doanh thu', 'revenue'],
      sentiment: 'neutral',
      topics: ['research', 'fundamentals', 'comparison', 'deep_dive']
    },
    prompt: `Phong cách: Phân tích chuyên sâu
- Đưa luận điểm rõ ràng, có dẫn chứng
- Sử dụng data/on-chain metrics nếu có thể
- Format: 1 luận điểm chính + 1-2 dẫn chứng
- Dùng emoji: 📊📈🔍💡
- Không quá dài (Twitter limit), nhưng đủ ý
- Ví dụ: "TVL up 40% but token still undervalued. On-chain data shows whale accumulation. Worth watching 📊"
- Hoặc: "The fundamentals are solid. Revenue growing, team shipping. Market hasn't caught up yet 💡"`
  },

  // ===== 3. HÀI HƯỚC/MEME =====
  // Kiểu @pukerrainbrow - funny, meme, relatable
  {
    id: 'meme_funny',
    name: '😂 Hài hước / Meme',
    description: 'Vui tính, dí dỏm, tạo engagement, phù hợp content casual',
    trigger: {
      keywords: ['lol', 'lmao', 'dead', '💀', 'ngu', 'stupid', 'degen', 'ape', 'ser', 'fren', 'gm', 'gn', 'vibe', 'mood', 'same'],
      sentiment: 'any',
      topics: ['meme', 'casual', 'shitpost', 'daily', 'relatable']
    },
    prompt: `Phong cách: Hài hước, meme, relatable
- Vui tính, dí dỏm, không quá nghiêm túc
- Dùng emoji: 😂💀🤣👀🗿
- Có thể dùng slang CT: "ser", "fren", "anon", "ngmi", "wagmi", "gigachad"
- Reply ngắn, witty, tạo cười
- Ví dụ: "Ser this is a Wendy's 💀", "Average degen behavior 😂", "ngmi nhưng mà vui 🗿"
- Hoặc: "Same energy every Monday morning 😂", "Most sane crypto holder right here 👀"`
  },

  // ===== 4. ASK QUESTION / THẢ THÍNH =====
  // Kiểu @gigiz_eth - đặt câu hỏi để tạo thảo luận
  {
    id: 'ask_question',
    name: '❓ Đặt câu hỏi / Thảo luận',
    description: 'Đặt câu hỏi thông minh để tạo thảo luận, tăng engagement',
    trigger: {
      keywords: ['what', 'how', 'why', 'thoughts', 'opinion', 'think', 'suy nghĩ', 'nghĩ gì', 'ý kiến', 'predict', 'forecast'],
      sentiment: 'any',
      topics: ['debate', 'question', 'discussion', 'prediction']
    },
    prompt: `Phong cách: Đặt câu hỏi thông minh
- Đặt 1 câu hỏi liên quan để tạo thảo luận
- Không quá dài, gợi mở
- Dùng emoji: 🤔💭❓👀
- Ví dụ: "What's your take on the token unlock schedule? 🤔", "Ser, you think this is sustainable or just hype? 💭"
- Hoặc: "Curious - what's your thesis here? 👀", "How does this compare to [competitor]? Genuinely asking 🤔"`
  },

  // ===== 5. SUPPORTIVE / ĐỒNG TÌNH =====
  // Kiểu @Yiyixmb - ủng hộ, đồng ý, thêm giá trị
  {
    id: 'supportive',
    name: '🤝 Ủng hộ / Đồng tình',
    description: 'Đồng ý, ủng hộ quan điểm, thêm góc nhìn tích cực',
    trigger: {
      keywords: ['agree', 'exactly', 'right', 'correct', 'true', 'đúng', 'chuẩn', 'yes', 'absolutely', 'this', '100%'],
      sentiment: 'positive',
      topics: ['agreement', 'support', 'validation']
    },
    prompt: `Phong cách: Ủng hộ, đồng tình
- Thể hiện đồng ý một cách tự nhiên (không phải "yes" khô khan)
- Thêm 1 lý do hoặc góc nhìn bổ sung
- Dùng emoji: ✅💯🤝🫡
- Ví dụ: "This. Exactly this. The market always overreacts short term ✅", "100% agree. Been saying this for months 💯"
- Hoặc: "Couldn't have said it better myself 🤝", "Facts. People sleeping on this hard 🫡"`
  },

  // ===== 6. ALPHA / INSIGHT =====
  // Kiểu @ZF_lab, @VIP8888883 - chia sẻ alpha, thông tin nội bộ
  {
    id: 'alpha_insight',
    name: '💎 Alpha / Insight',
    description: 'Chia sẻ thông tin giá trị, alpha, insider perspective',
    trigger: {
      keywords: ['alpha', 'early', 'undervalued', 'hidden', 'gem', 'sleeping', 'underrated', 'early stage', 'seed', 'private', 'whale', 'smart money'],
      sentiment: 'positive',
      topics: ['alpha', 'early_project', 'undervalued', 'opportunity']
    },
    prompt: `Phong cách: Alpha/Insight
- Chia sẻ thông tin giá trị một cách subtle
- Không shill quá lộ liễu
- Dùng emoji: 💎👀🧠🔬
- Giữ bí 1 chút: "wink wink", "DYOR", "NFA"
- Ví dụ: "Been watching this one for a while. On-chain tells a different story than the chart 👀", "Smart money has been accumulating quietly. DYOR 💎"
- Hoặc: "The alpha is in the git commits, not the CT timeline 🧠", "Few understand this yet 🔬"`
  },

  // ===== 7. CHUYÊN NGHIỆP / INSTITUTIONAL =====
  // Kiểu @jerallaire - CEO, chuyên nghiệp, có trọng lượng
  {
    id: 'professional',
    name: '💼 Chuyên nghiệp / Institutional',
    description: 'Lịch sự, có trọng lượng, phù hợp khi nói về dự án lớn',
    trigger: {
      keywords: ['regulation', 'compliance', 'institutional', 'adoption', 'partnership', 'enterprise', 'SEC', 'ETF', 'stablecoin', 'CBDC', 'infrastructure'],
      sentiment: 'neutral',
      topics: ['institutional', 'regulation', 'enterprise', 'infrastructure']
    },
    prompt: `Phong cách: Chuyên nghiệp, institutional
- Lịch sự, trang trọng nhưng không cứng nhắc
- Dùng thuật ngữ chuyên môn
- Dùng emoji: 💼🏢📈🏛️
- Có thể đề cập đến regulation, compliance, adoption
- Ví dụ: "Important milestone for the ecosystem. Institutional adoption accelerating 🏛️", "This is exactly the kind of infrastructure we need for mainstream adoption 💼"
- Hoặc: "Great to see regulatory clarity improving. This benefits everyone in the space 📈"`
  },

  // ===== 8. COMMUNITY / THÂN THIỆN =====
  // Kiểu @momochenming - cộng đồng, gần gũi, hỗ trợ
  {
    id: 'community',
    name: '🫂 Cộng đồng / Thân thiện',
    description: 'Gần gũi, hỗ trợ, tạo không khí cộng đồng tích cực',
    trigger: {
      keywords: ['community', 'team', 'together', 'build', 'cộng đồng', 'anh em', 'fam', 'frens', 'homies', 'support', 'help'],
      sentiment: 'positive',
      topics: ['community', 'team', 'support', 'collaboration']
    },
    prompt: `Phong cách: Cộng đồng, thân thiện
- Gần gũi, ấm áp, tạo cảm giác belong
- Dùng emoji: 🫂❤️🙏💪🌟
- Có thể dùng: "fam", "frens", "anh em", "team"
- Ví dụ: "This is why I love this community. Always supporting each other 🫂", "We're all gonna make it together fam 💪"
- Hoặc: "W community. Thanks for sharing this 🙏", "Bear market builds character, bull market tests it. We got this team ❤️"`
  },

  // ===== 9. CẢNH BÁO / SKEPTICAL =====
  // Kiểu @thejasich - cẩn thận, cảnh báo, phân tích rủi ro
  {
    id: 'skeptical',
    name: '⚠️ Cảnh báo / Skeptical',
    description: 'Cẩn thận, cảnh báo rủi ro, đặt câu hỏi nghi vấn',
    trigger: {
      keywords: ['risk', 'careful', 'scam', 'rug', 'fake', 'suspicious', 'cẩn thận', 'lừa đảo', 'red flag', 'too good', 'vaporware'],
      sentiment: 'negative',
      topics: ['risk', 'scam', 'warning', 'suspicious']
    },
    prompt: `Phong cách: Cảnh báo, skeptical
- Cẩn thận, đặt câu hỏi nghi vấn
- Không quá tiêu cực, nhưng cảnh báo
- Dùng emoji: ⚠️🚩🧐🔍
- Ví dụ: "Red flags everywhere. DYOR before aping in ⚠️", "Sounds too good to be true. What's the catch? 🧐"
- Hoặc: "Ser, have you checked the tokenomics? 80% team allocation 🚩", "This gives me strong 2022 vibes. Stay safe out there ⚠️"`
  },

  // ===== 10. MINIMAL / GM ENERGY =====
  // Kiểu @pukerrainbrow - ngắn gọn, vibe, energy
  {
    id: 'minimal_gm',
    name: '✨ Minimal / GM Energy',
    description: 'Ngắn gọn, tạo vibe, energy tốt, không cần dài dòng',
    trigger: {
      keywords: ['gm', 'gn', 'vibes', 'energy', 'mood', 'based', 'chad', 'gigachad', 'w', 'massive', 'huge', 'insane'],
      sentiment: 'positive',
      topics: ['casual', 'daily', 'vibe', 'energy']
    },
    prompt: `Phong cách: Minimal, GM energy
- Rất ngắn, 1-3 từ + emoji
- Tạo vibe tốt, energy
- Dùng emoji: ✨🫡🙌💪🔥👀🗿
- Ví dụ: "Based ✨", "GM king 🫡", "Massive W 🔥", "This guy gets it 👀"
- Hoặc: "Chad energy 🗿", "Vibes immaculate ✨", "Huge if true 💪", "ngl this is fire 🔥"`
  }
];

// ===================================================
// Style Selector - Chọn phong cách phù hợp nhất
// ===================================================

function selectBestStyle(tweetText, commentText) {
  const combined = (tweetText + ' ' + commentText).toLowerCase();
  const scores = [];

  for (const style of REPLY_STYLES) {
    let score = 0;

    // Keyword matching
    for (const kw of style.trigger.keywords) {
      if (combined.includes(kw.toLowerCase())) {
        score += 2;
      }
    }

    // Topic matching (nếu có)
    // (sẽ được mở rộng khi có topic detection)

    scores.push({ style, score });
  }

  // Sắp xếp theo score, nếu bằng nhau thì random
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Math.random() - 0.5;
  });

  // Nếu top score > 0, chọn top. Nếu tất cả = 0, random
  if (scores[0].score > 0) {
    return scores[0].style;
  }

  // Random từ tất cả styles (tránh luôn chọn 1 kiểu)
  const randomIndex = Math.floor(Math.random() * REPLY_STYLES.length);
  return REPLY_STYLES[randomIndex];
}

// ===================================================
// Context Analyzer - Phân tích ngữ cảnh bài viết
// ===================================================

function analyzeContext(tweetText, commentText) {
  const combined = (tweetText + ' ' + commentText).toLowerCase();

  // Detect sentiment cơ bản
  const positiveWords = ['pump', 'moon', 'bullish', 'good', 'great', 'amazing', 'tốt', 'tuyệt', 'hay', 'love', 'best', 'x2', 'x10', 'profit', 'lãi'];
  const negativeWords = ['dump', 'crash', 'bear', 'bad', 'scam', 'rug', 'xấu', 'tệ', 'lỗ', 'loss', 'red', 'blood'];
  const questionWords = ['what', 'how', 'why', 'when', 'where', 'gì', 'sao', 'như thế nào', 'tại sao', '?'];

  let sentiment = 'neutral';
  const posCount = positiveWords.filter(w => combined.includes(w)).length;
  const negCount = negativeWords.filter(w => combined.includes(w)).length;
  const hasQuestion = questionWords.some(w => combined.includes(w));

  if (posCount > negCount) sentiment = 'positive';
  else if (negCount > posCount) sentiment = 'negative';

  // Detect topic
  const topics = [];
  if (combined.match(/defi|swap|liquidity|pool|farm|yield|stake/)) topics.push('defi');
  if (combined.match(/nft|mint|collection|opensea|art/)) topics.push('nft');
  if (combined.match(/layer2|l2|rollup|zk|optimism|arbitrum|base/)) topics.push('l2');
  if (combined.match(/btc|bitcoin|eth|ethereum|sol|solana/)) topics.push('major');
  if (combined.match(/memecoin|meme|doge|pepe|shib|bonk/)) topics.push('meme');
  if (combined.match(/ai|artificial|machine learning|gpt|agent/)) topics.push('ai');
  if (combined.match(/launch|presale|ido|ico|airdrop/)) topics.push('launch');
  if (combined.match(/whale|big money|smart money|institutional/)) topics.push('whale');
  if (combined.match(/regulation|sec|etf|compliance|legal/)) topics.push('regulation');
  if (combined.match(/metaverse|gaming|game|play/)) topics.push('gaming');

  return {
    sentiment,
    topics,
    hasQuestion,
    isShortComment: commentText.length < 50,
    isLongComment: commentText.length > 200,
    hasEmoji: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/u.test(commentText),
    hasCasualSlang: /ser|fren|anon|ngmi|wagmi|gm|gn|lmao|lol|bruh/i.test(commentText)
  };
}

// Export
if (typeof module !== 'undefined') {
  module.exports = { REPLY_STYLES, selectBestStyle, analyzeContext };
}
