// ===================================================
// Twitter Auto Reply - Content Script
// Logic: Scan 15 newest tweets → find comments → queue for reply
// ===================================================

(() => {
  'use strict';

  // ---- State ----
  let config = {};
  let myUsername = '';
  let myDisplayName = '';
  let myTweetsCache = [];         // cache tweet đã scan
  let scanInterval = null;
  let observer = null;
  const PROCESSED_TWEET = 'data-ar-tweet';
  const PROCESSED_COMMENT = 'data-ar-comment';
  const MY_TWEET_ATTR = 'data-ar-mine';

  // ---- Init ----
  async function init() {
    config = await loadConfig();
    myUsername = await detectMyUsername();

    // Gửi thông tin tài khoản lên side panel
    chrome.runtime.sendMessage({
      action: 'accountDetected',
      username: myUsername,
      displayName: myDisplayName
    }).catch(() => {});

    injectStatusBadge();

    if (!config.enabled) {
      log('Disabled');
      return;
    }

    log(`Starting... username: @${myUsername}`);
    startObserver();
    startPeriodicScan();

    // Scan ngay khi load
    setTimeout(() => {
      scanMyTweets();
      scanAllComments();
    }, 3000);
  }

  // ---- Config ----
  async function loadConfig() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'getConfig' }, res => {
        resolve(res?.config || {});
      });
    });
  }

  // ===================================================
  // Detect My Username & Display Name
  // ===================================================
  async function detectMyUsername() {
    // Ưu tiên: config đã lưu > auto detect
    if (config.myUsername) {
      myDisplayName = config.myDisplayName || '';
      log(`Username from config: @${config.myUsername}`);
      return config.myUsername.toLowerCase();
    }

    // ---- Auto detect ----

    // Cách 1: Link profile trên tab bar (chính xác nhất)
    const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href') || '';
      const match = href.match(/^\/([^/]+)$/);
      if (match) {
        detectDisplayName(profileLink);
        log(`Username from profile tab: @${match[1]}`);
        return match[1].toLowerCase();
      }
    }

    // Cách 2: Link "Me" tab
    const meTab = document.querySelector('[data-testid="AppTabBar_Me_Link"]');
    if (meTab) {
      const href = meTab.getAttribute('href') || '';
      const match = href.match(/^\/([^/]+)$/);
      if (match) {
        log(`Username from me tab: @${match[1]}`);
        return match[1].toLowerCase();
      }
    }

    // Cách 3: Avatar link → /username/photo
    const avatarLink = document.querySelector('a[href*="/photo"]');
    if (avatarLink) {
      const href = avatarLink.getAttribute('href') || '';
      const match = href.match(/^\/([^/]+)\/photo/);
      if (match) {
        log(`Username from avatar: @${match[1]}`);
        return match[1].toLowerCase();
      }
    }

    // Cách 4: User dropdown menu (góc trái dưới)
    const userMenu = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (userMenu) {
      const nameEl = userMenu.querySelector('span');
      if (nameEl) {
        const text = nameEl.textContent?.trim();
        if (text) {
          myDisplayName = text;
        }
      }
    }

    // Cách 5: Tìm trong sidebar "Account" link
    const sideNavLinks = document.querySelectorAll('nav a[href]');
    for (const link of sideNavLinks) {
      const href = link.getAttribute('href') || '';
      if (/^\/[a-zA-Z0-9_]{1,15}$/.test(href) && !href.includes('/search') && !href.includes('/explore')) {
        const nameEl = link.querySelector('span');
        const text = nameEl?.textContent?.trim();
        if (text && !text.startsWith('@')) {
          myDisplayName = text;
        }
        const match = href.match(/^\/([^/]+)$/);
        if (match) {
          log(`Username from sidenav: @${match[1]}`);
          return match[1].toLowerCase();
        }
      }
    }

    // Cách 6: Tìm tất cả link có @text
    const allLinks = document.querySelectorAll('a[href^="/"]');
    for (const link of allLinks) {
      const href = link.getAttribute('href') || '';
      if (/^\/[a-zA-Z0-9_]{1,15}$/.test(href)) {
        const text = link.textContent?.trim();
        if (text && text.startsWith('@')) {
          log(`Username from link text: @${text.replace('@', '')}`);
          return text.replace('@', '').toLowerCase();
        }
      }
    }

    // Cách 7: Lấy từ URL nếu đang ở trang profile
    const urlMatch = window.location.pathname.match(/^\/([a-zA-Z0-9_]{1,15})(?:\/|$)/);
    if (urlMatch && !['home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i'].includes(urlMatch[1])) {
      log(`Username from URL: @${urlMatch[1]}`);
      return urlMatch[1].toLowerCase();
    }

    log('⚠️ Could not detect username');
    return '';
  }

  // Detect display name từ profile link
  function detectDisplayName(profileLink) {
    try {
      // Tìm span chứa display name trong profile link
      const spans = profileLink.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent?.trim();
        // Display name không bắt đầu bằng @ và không phải số
        if (text && !text.startsWith('@') && text.length > 0 && text.length < 50 && isNaN(text)) {
          myDisplayName = text;
          return;
        }
      }
    } catch {}
  }

  // ===================================================
  // Scan My Tweets (15 newest)
  // ===================================================
  function scanMyTweets() {
    if (!myUsername) {
      myUsername = detectMyUsername();
      if (!myUsername) return;
    }

    const tweets = [];
    const articles = document.querySelectorAll('article[data-testid="tweet"]');

    for (const article of articles) {
      try {
        // Check if this is my tweet
        const usernameEl = article.querySelector('[data-testid="User-Name"] a');
        const href = usernameEl?.getAttribute('href') || '';
        const username = href.replace('/', '').toLowerCase();

        if (username !== myUsername.toLowerCase()) continue;

        // Extract tweet data
        const textEl = article.querySelector('[data-testid="tweetText"]');
        const text = textEl?.innerText?.trim() || '';
        if (!text) continue;

        // Get tweet ID from link
        const timeEl = article.querySelector('time');
        const linkEl = timeEl?.closest('a');
        const tweetUrl = linkEl?.href || '';
        const idMatch = tweetUrl.match(/\/status\/(\d+)/);
        const tweetId = idMatch ? idMatch[1] : '';

        if (!tweetId) continue;

        // Get timestamp
        const timeAttr = timeEl?.getAttribute('datetime');
        const tweetTime = timeAttr ? new Date(timeAttr).getTime() : Date.now();

        // Count replies visible
        const replyCountEl = article.querySelector('[data-testid="reply"] span');
        const commentCount = parseInt(replyCountEl?.textContent) || 0;

        // Mark as mine
        article.setAttribute(MY_TWEET_ATTR, 'true');
        article.setAttribute(PROCESSED_TWEET, tweetId);

        tweets.push({ tweetId, text: text.substring(0, 200), time: tweetTime, commentCount });

      } catch (err) {
        console.error('[AutoReply] scanMyTweets error:', err);
      }
    }

    if (tweets.length > 0) {
      // Deduplicate
      const existingIds = new Set(myTweetsCache.map(t => t.tweetId));
      let added = 0;
      for (const t of tweets) {
        if (!existingIds.has(t.tweetId)) {
          myTweetsCache.push(t);
          added++;
        }
      }

      // Sort & limit
      myTweetsCache.sort((a, b) => b.time - a.time);
      myTweetsCache = myTweetsCache.slice(0, config.maxTweetsToScan || 15);

      // Send to background
      chrome.runtime.sendMessage({
        action: 'updateMyTweets',
        tweets: myTweetsCache,
        username: myUsername,
        displayName: myDisplayName
      }, res => {
        if (res?.success) {
          log(`Tweets updated: +${res.added}, total: ${res.total}`);
        }
      });

      if (added > 0) {
        showToast(`📰 Phát hiện ${added} bài viết mới`);
      }
    }
  }

  // ===================================================
  // Scan Comments on My Tweets
  // ===================================================
  function scanAllComments() {
    if (!config.enabled) return;

    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    const articlesArray = Array.from(articles);

    for (let i = 0; i < articlesArray.length; i++) {
      const article = articlesArray[i];

      // Nếu đây là tweet của tôi → đánh dấu nhưng không queue
      if (article.hasAttribute(MY_TWEET_ATTR)) continue;

      // Tìm tweetId của bài gốc chứa comment này
      const parentTweetId = findParentTweetId(article);
      if (!parentTweetId) continue;

      // Kiểm tra xem có phải comment trong 15 bài của tôi không
      const isMyTweetComment = myTweetsCache.some(t => t.tweetId === parentTweetId);
      if (!isMyTweetComment) continue;

      // Skip nếu đã xử lý
      if (article.hasAttribute(PROCESSED_COMMENT)) continue;
      article.setAttribute(PROCESSED_COMMENT, 'true');

      // Extract comment data
      const commentData = extractCommentData(article);
      if (!commentData) continue;

      // Skip comment của chính mình
      if (commentData.username.toLowerCase() === myUsername.toLowerCase()) continue;

      // ===== KIỂM TRA ĐÃ REPLY CHƯA =====
      if (hasAlreadyReplied(article, articlesArray, i)) {
        article.setAttribute('data-ar-already-replied', 'true');
        log(`Skip (already replied): @${commentData.username}`);
        continue;
      }

      // Get tweet time for priority sorting
      const tweetInfo = myTweetsCache.find(t => t.tweetId === parentTweetId);
      const tweetTime = tweetInfo?.time || 0;

      log(`Comment on ${parentTweetId}: "${commentData.text.substring(0, 40)}..." by @${commentData.username}`);

      // Queue
      chrome.runtime.sendMessage({
        action: 'queueComment',
        tweetId: parentTweetId,
        commentId: commentData.id,
        comment: commentData.text,
        username: commentData.username,
        tweetTime: tweetTime
      }, res => {
        if (res?.success) {
          log(`Queued: @${commentData.username}`);
          showToast(`💬 Queue: @${commentData.username}`);
        } else if (res?.reason) {
          log(`Skip: ${res.reason}`);
        }
      });
    }
  }

  // ===================================================
  // Kiểm tra đã reply comment chưa
  // ===================================================
  // Trên Twitter, reply hiển thị ngay sau comment trong thread.
  // Kiểm tra xem có article nào của myUsername nằm sau comment
  // (trước comment tiếp theo) hay không.
  // ===================================================

  function hasAlreadyReplied(commentArticle, allArticles, currentIndex) {
    if (!myUsername) return false;

    // Cách 1: Kiểm tra DOM — tìm reply của tôi trong cùng thread
    // Đi qua các article sau comment, dừng khi gặp comment mới (không phải reply)
    for (let j = currentIndex + 1; j < allArticles.length; j++) {
      const nextArticle = allArticles[j];

      // Nếu gặp tweet của tôi (MY_TWEET_ATTR) → dừng, đây là bài viết mới
      if (nextArticle.hasAttribute(MY_TWEET_ATTR)) break;

      // Lấy username của article tiếp theo
      const nextUsername = getArticleUsername(nextArticle);
      if (!nextUsername) continue;

      // Nếu là comment mới (không phải reply) → dừng
      // Kiểm tra: nếu article không có link reply indicator thì là comment mới
      const isReply = isReplyToComment(nextArticle, commentArticle);
      if (!isReply && nextUsername.toLowerCase() !== myUsername.toLowerCase()) break;

      // Nếu đây là reply của tôi → đã reply rồi!
      if (nextUsername.toLowerCase() === myUsername.toLowerCase()) {
        return true;
      }
    }

    // Cách 2: Kiểm tra bằng cách đếm reply button text
    // Twitter hiển thị "Replying to @username" trong reply
    const replyingTo = commentArticle.closest('[data-testid="cellInnerDiv"]')
      ?.querySelectorAll('a[href*="/status/"]');
    // (không可靠, bỏ qua)

    // Cách 3: Kiểm tra thread context
    // Nếu comment có "X replies" và một trong số đó là của tôi
    // (không thể biết từ DOM, bỏ qua)

    return false;
  }

  // Lấy username từ article
  function getArticleUsername(articleEl) {
    try {
      const usernameEl = articleEl.querySelector('[data-testid="User-Name"] a');
      const href = usernameEl?.getAttribute('href') || '';
      return href.replace('/', '').toLowerCase();
    } catch {
      return '';
    }
  }

  // Kiểm tra xem article có phải reply của comment trước đó không
  // Bằng cách kiểm tra xem nó có "indent" (thread line) hay không
  function isReplyToComment(articleEl, parentArticleEl) {
    try {
      // Cách 1: Kiểm tra xem article có nằm trong thread không
      // Twitter hiển thị thread replies với connector line
      const cellInnerDiv = articleEl.closest('[data-testid="cellInnerDiv"]');
      const parentCell = parentArticleEl.closest('[data-testid="cellInnerDiv"]');

      if (!cellInnerDiv || !parentCell) return false;

      // Nếu cell liền kề nhau và có connector → là reply
      // Twitter dùng data-testid="tweet" trong cùng thread
      const threadConnector = cellInnerDiv.querySelector('[data-testid="tweet"]');

      // Cách 2: Kiểm tra "Replying to" text
      const replyingToEl = articleEl.querySelector('a[href*="/"]');
      const replyingToText = articleEl.textContent || '';

      // Nếu có "Replying to" hoặc có indent → là reply
      if (replyingToText.includes('Replying to')) return true;

      // Cách 3: Kiểm tra vị trí Y — reply thường gần comment gốc
      const rect1 = articleEl.getBoundingClientRect();
      const rect2 = parentArticleEl.getBoundingClientRect();
      const distance = Math.abs(rect1.top - rect2.bottom);

      // Nếu khoảng cách nhỏ (< 200px) → có thể là reply liền kề
      if (distance < 200) return true;

      return false;
    } catch {
      return false;
    }
  }

  // ---- Find Parent Tweet ID ----
  function findParentTweetId(articleEl) {
    // Cách 1: URL hiện tại (đang ở trang tweet)
    const urlMatch = window.location.href.match(/\/status\/(\d+)/);
    if (urlMatch) return urlMatch[1];

    // Cách 2: Tìm link /status/ trong article
    const links = articleEl.querySelectorAll('a[href*="/status/"]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      // Link tới bài viết (không phải link reply)
      const match = href.match(/^\/[^/]+\/status\/(\d+)$/);
      if (match) return match[1];
    }

    // Cách 3: Link trong time element
    const timeEl = articleEl.querySelector('time');
    const timeLink = timeEl?.closest('a');
    if (timeLink) {
      const match = timeLink.href.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }

    return null;
  }

  // ---- Extract Comment Data ----
  function extractCommentData(articleEl) {
    try {
      const textEl = articleEl.querySelector('[data-testid="tweetText"]');
      const text = textEl?.innerText?.trim();
      if (!text) return null;

      const usernameEl = articleEl.querySelector('[data-testid="User-Name"] a');
      const username = usernameEl?.textContent?.trim()?.replace('@', '') || 'unknown';

      const timeEl = articleEl.querySelector('time');
      const linkEl = timeEl?.closest('a');
      const tweetUrl = linkEl?.href || '';
      const idMatch = tweetUrl.match(/\/status\/(\d+)/);
      const id = idMatch ? idMatch[1] : btoa(unescape(encodeURIComponent(text + username + Date.now()))).substring(0, 20);

      return { id, text, username };
    } catch {
      return null;
    }
  }

  // ===================================================
  // Reply Posting (called from background)
  // ===================================================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'postReply') {
      postReply(msg.tweetId, msg.commentId, msg.reply, msg.username)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'scanMyTweets') {
      scanMyTweets();
      setTimeout(() => scanAllComments(), 1000);
      sendResponse({ success: true });
      return true;
    }

    if (msg.action === 'scanNow') {
      scanMyTweets();
      setTimeout(() => scanAllComments(), 1000);
      sendResponse({ success: true });
      return true;
    }
  });

  async function postReply(tweetId, commentId, replyText, username) {
    log(`Replying to @${username}: "${replyText.substring(0, 40)}..."`);

    // Tìm comment article
    let targetArticle = null;
    const articles = document.querySelectorAll(`article[data-testid="tweet"]:not([data-ar-replied])`);

    for (const article of articles) {
      const timeEl = article.querySelector('time');
      const linkEl = timeEl?.closest('a');
      const url = linkEl?.href || '';
      if (url.includes(commentId)) {
        targetArticle = article;
        break;
      }
    }

    if (!targetArticle) {
      targetArticle = document.querySelector(`article[data-testid="tweet"]:not([${PROCESSED_COMMENT}])`);
    }

    if (!targetArticle) throw new Error('Comment not found');

    // ===== CHẠM VÀO BÌNH LUẬN (như người thật) =====
    // 1. Scroll tới comment
    targetArticle.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(randomBetween(800, 1500));

    // 2. Hover vào comment 1 chút
    const hoverEvent = new MouseEvent('mouseover', { bubbles: true });
    targetArticle.dispatchEvent(hoverEvent);
    await sleep(randomBetween(300, 700));

    // 3. Click reply button
    const replyBtn = targetArticle.querySelector('[data-testid="reply"]');
    if (!replyBtn) throw new Error('Reply button not found');
    replyBtn.click();
    await sleep(randomBetween(1000, 2000));

    // ===== ĐỢI INPUT HIỆN RA =====
    const replyInput = await waitForElement('[data-testid="tweetTextarea_0"]', 5000);
    if (!replyInput) throw new Error('Reply input not found');

    // ===== SUY NGHĨ TRƯỚC KHI GÕ =====
    // Như người thật: đọc comment, suy nghĩ 1-3 giây
    replyInput.focus();
    await sleep(randomBetween(1000, 3000));

    // ===== GÕ TỪNG CHỮ NHƯ NGƯỜI THẬT =====
    if (config.humanTyping !== false) {
      await humanType(replyInput, replyText);
    } else {
      // Gõ nhanh (paste)
      document.execCommand('insertText', false, replyText);
      await sleep(500);
    }

    // ===== SUY NGHĨ SAU KHI GÕ XONG =====
    // Đọc lại reply 0.5-1.5 giây trước khi gửi
    await sleep(randomBetween(500, 1500));

    // ===== GỬI =====
    const submitBtn = await waitForElement('[data-testid="tweetButton"]', 3000);
    if (!submitBtn) throw new Error('Submit button not found');
    submitBtn.click();
    await sleep(2000);

    // Mark replied
    targetArticle.setAttribute('data-ar-replied', 'true');

    log(`Reply posted ✓`);
    showToast(`✅ Đã reply @${username}`);
  }

  // ===================================================
  // 🤖➡️👤 Human-Like Typing System
  // ===================================================

  // Ký tự tiếng Việt có dấu → cách gõ sai phổ biến
  const VIETNAMESE_TYPO_MAP = {
    'ă': ['a', 'aw'],
    'â': ['a', 'aa'],
    'đ': ['d', 'dd'],
    'ê': ['e', 'ee'],
    'ô': ['o', 'oo'],
    'ơ': ['o', 'ow'],
    'ư': ['u', 'uw'],
    'á': ['a', 'as'],
    'à': ['a', 'af'],
    'ả': ['a', 'ar'],
    'ã': ['a', 'ax'],
    'ạ': ['a', 'aj'],
    'ắ': ['aw', 'aws'],
    'ằ': ['aw', 'awf'],
    'ẳ': ['aw', 'awr'],
    'ẵ': ['aw', 'awx'],
    'ặ': ['aw', 'awj'],
    'ấ': ['aa', 'aas'],
    'ầ': ['aa', 'aaf'],
    'ẩ': ['aa', 'aar'],
    'ẫ': ['aa', 'aax'],
    'ậ': ['aa', 'aaj'],
    'é': ['e', 'es'],
    'è': ['e', 'ef'],
    'ẻ': ['e', 'er'],
    'ẽ': ['e', 'ex'],
    'ẹ': ['e', 'ej'],
    'ế': ['ee', 'ees'],
    'ề': ['ee', 'eef'],
    'ể': ['ee', 'eer'],
    'ễ': ['ee', 'eex'],
    'ệ': ['ee', 'eej'],
    'í': ['i', 'is'],
    'ì': ['i', 'if'],
    'ỉ': ['i', 'ir'],
    'ĩ': ['i', 'ix'],
    'ị': ['i', 'ij'],
    'ó': ['o', 'os'],
    'ò': ['o', 'of'],
    'ỏ': ['o', 'or'],
    'õ': ['o', 'ox'],
    'ọ': ['o', 'oj'],
    'ố': ['oo', 'oos'],
    'ồ': ['oo', 'oof'],
    'ổ': ['oo', 'oor'],
    'ỗ': ['oo', 'oox'],
    'ộ': ['oo', 'ooj'],
    'ớ': ['ow', 'ows'],
    'ờ': ['ow', 'owf'],
    'ở': ['ow', 'owr'],
    'ỡ': ['ow', 'owx'],
    'ợ': ['ow', 'owj'],
    'ú': ['u', 'us'],
    'ù': ['u', 'uf'],
    'ủ': ['u', 'ur'],
    'ũ': ['u', 'ux'],
    'ụ': ['u', 'uj'],
    'ứ': ['uw', 'uws'],
    'ừ': ['uw', 'uwf'],
    'ử': ['uw', 'uwr'],
    'ữ': ['uw', 'uwx'],
    'ự': ['uw', 'uwj'],
    'ý': ['y', 'ys'],
    'ỳ': ['y', 'yf'],
    'ỷ': ['y', 'yr'],
    'ỹ': ['y', 'yx'],
    'ỵ': ['y', 'yj']
  };

  // Bàn phím gần nhau (dễ gõ sai)
  const ADJACENT_KEYS = {
    'a': 'sqwedz', 'b': 'vghn', 'c': 'xdfv', 'd': 'sfcer',
    'e': 'wrds', 'f': 'dgcvr', 'g': 'fhbvt', 'h': 'gjbny',
    'i': 'ujko', 'j': 'hknmu', 'k': 'jloi', 'l': 'kop',
    'm': 'njk', 'n': 'bhjm', 'o': 'iklp', 'p': 'ol',
    'q': 'wa', 'r': 'edft', 's': 'awdxz', 't': 'rfgy',
    'u': 'yhji', 'v': 'cfgb', 'w': 'qase', 'x': 'zsdc',
    'y': 'tghu', 'z': 'asx'
  };

  async function humanType(inputEl, text) {
    const shouldTypo = () => Math.random() < 0.04; // 4% chance gõ sai mỗi ký tự
    const shouldPause = () => Math.random() < 0.08; // 8% chance dừng suy nghĩ
    const shouldLongPause = () => Math.random() < 0.02; // 2% chance dừng lâu

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // ===== DỪNG SUY NGHĨ GIỮA CHỪNG =====
      if (shouldLongPause()) {
        // Dừng lâu 1-3 giây (đang suy nghĩ câu tiếp)
        await sleep(randomBetween(1000, 3000));
      } else if (shouldPause()) {
        // Dừng ngắn 0.3-0.8 giây
        await sleep(randomBetween(300, 800));
      }

      // ===== GÕ SAI RỒI SỬA =====
      if (shouldTypo() && i > 0 && i < text.length - 1) {
        const typoChar = getTypoChar(char);
        if (typoChar) {
          // Gõ sai
          insertChar(inputEl, typoChar);
          await sleep(randomBetween(100, 300));

          // Nhận ra sai (đợi 0.2-0.5 giây)
          await sleep(randomBetween(200, 500));

          // Xóa ký tự sai (Backspace)
          pressKey(inputEl, 'Backspace');
          await sleep(randomBetween(80, 200));

          // Gõ lại đúng
          insertChar(inputEl, char);
          await sleep(randomBetween(50, 150));
          continue;
        }
      }

      // ===== GÕ BÌNH THƯỜNG =====
      insertChar(inputEl, char);

      // Tốc độ gõ thay đổi (giống người thật)
      // Nhanh: 50-120ms, Bình thường: 100-200ms, Chậm: 150-350ms
      const typingStyle = Math.random();
      let delay;
      if (typingStyle < 0.3) {
        delay = randomBetween(50, 120);   // gõ nhanh
      } else if (typingStyle < 0.8) {
        delay = randomBetween(100, 200);  // bình thường
      } else {
        delay = randomBetween(150, 350);  // gõ chậm (suy nghĩ)
      }

      // Dấu cách (space) thường dừng lâu hơn 1 chút
      if (char === ' ') {
        delay += randomBetween(30, 100);
      }

      // Sau dấu chấm, phẩy, chấm hỏi → dừng lâu hơn (đọc lại)
      if ('.!?…'.includes(char)) {
        delay += randomBetween(200, 600);
      }

      await sleep(delay);
    }
  }

  // Chèn ký tự vào input (dùng InputEvent cho Twitter)
  function insertChar(inputEl, char) {
    // Twitter dùng contenteditable div, cần dispatch InputEvent
    const inputEvent = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: char,
      bubbles: true,
      cancelable: true
    });
    inputEl.dispatchEvent(inputEvent);

    // Fallback: dùng document.execCommand
    document.execCommand('insertText', false, char);
  }

  // Mô phỏng phím (Backspace, etc.)
  function pressKey(inputEl, key) {
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    if (key === 'Backspace') {
      // Xóa ký tự trước con trỏ
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (range.collapsed) {
          // Mở rộng selection về trước 1 ký tự
          range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
          range.deleteContents();
        } else {
          range.deleteContents();
        }
      }
    }
    inputEl.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  }

  // Lấy ký tự gõ sai (dựa vào bàn phím gần nhau hoặc lỗi dấu tiếng Việt)
  function getTypoChar(char) {
    const lower = char.toLowerCase();

    // 1. Lỗi dấu tiếng Việt
    if (VIETNAMESE_TYPO_MAP[char]) {
      const typos = VIETNAMESE_TYPO_MAP[char];
      return typos[Math.floor(Math.random() * typos.length)];
    }

    // 2. Lỗi bàn phím gần nhau
    if (ADJACENT_KEYS[lower]) {
      const adjacent = ADJACENT_KEYS[lower];
      const typo = adjacent[Math.floor(Math.random() * adjacent.length)];
      // Giữ nguyên case
      return char === char.toUpperCase() ? typo.toUpperCase() : typo;
    }

    return null;
  }

  // Random giữa 2 số
  function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ===================================================
  // Observer & Periodic Scan
  // ===================================================
  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      let hasNew = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches?.('article[data-testid="tweet"]') ||
              node.querySelector?.('article[data-testid="tweet"]')) {
              hasNew = true;
              break;
            }
          }
        }
        if (hasNew) break;
      }

      if (hasNew) {
        clearTimeout(observer._debounce);
        observer._debounce = setTimeout(() => {
          scanMyTweets();
          scanAllComments();
        }, 2000);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    log('Observer started');
  }

  function startPeriodicScan() {
    if (scanInterval) clearInterval(scanInterval);
    scanInterval = setInterval(() => {
      scanMyTweets();
      scanAllComments();
    }, 30000); // scan mỗi 30 giây
    log('Periodic scan started (30s)');
  }

  // ===================================================
  // UI Helpers
  // ===================================================
  function injectStatusBadge() {
    const existing = document.getElementById('autoreply-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.id = 'autoreply-badge';
    badge.innerHTML = `
      <div class="autoreply-badge ${config.enabled ? 'active' : 'inactive'}">
        <span class="autoreply-dot"></span>
        <span class="autoreply-text">${config.enabled ? 'AutoReply ON' : 'AutoReply OFF'}</span>
      </div>
    `;
    document.body.appendChild(badge);

    badge.addEventListener('click', async () => {
      config.enabled = !config.enabled;
      await chrome.runtime.sendMessage({ action: 'saveConfig', data: { enabled: config.enabled } });
      badge.querySelector('.autoreply-badge').className =
        `autoreply-badge ${config.enabled ? 'active' : 'inactive'}`;
      badge.querySelector('.autoreply-text').textContent =
        config.enabled ? 'AutoReply ON' : 'AutoReply OFF';

      if (config.enabled) {
        startObserver();
        startPeriodicScan();
        scanMyTweets();
        setTimeout(() => scanAllComments(), 1000);
        showToast('🟢 AutoReply BẬT');
      } else {
        if (observer) observer.disconnect();
        if (scanInterval) clearInterval(scanInterval);
        showToast('🔴 AutoReply TẮT');
      }
    });
  }

  function showToast(message) {
    const existing = document.getElementById('autoreply-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'autoreply-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function waitForElement(selector, timeout = 5000) {
    return new Promise(resolve => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
    });
  }

  function log(...args) {
    console.log('[AutoReply]', ...args);
  }

  // ---- Config changes ----
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.config) {
      config = { ...config, ...changes.config.newValue };
      if (config.enabled) {
        startObserver();
        startPeriodicScan();
      } else {
        if (observer) observer.disconnect();
        if (scanInterval) clearInterval(scanInterval);
      }
    }
  });

  // ---- Start ----
  init();
})();
