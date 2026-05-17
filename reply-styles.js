// ===================================================
// Twitter Auto Reply - Reply Styles Utilities
// NOTE: REPLY_STYLES array is defined in background.js (service worker)
// This file provides utility functions for content script context
// ===================================================

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

// Export (for content script context)
if (typeof module !== 'undefined') {
  module.exports = { analyzeContext };
}
