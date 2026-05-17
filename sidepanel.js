// ===================================================
// Twitter Auto Reply - Side Panel Script
// ===================================================

document.addEventListener('DOMContentLoaded', async () => {
  // ---- State ----
  let config = {};
  let activityLogs = [];
  const MAX_LOGS = 100;

  // ---- Elements ----
  const toggleEnabled = document.getElementById('toggleEnabled');
  const statusText = document.getElementById('statusText');
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  // Chat tab
  const todayCount = document.getElementById('todayCount');
  const totalCount = document.getElementById('totalCount');
  const queueCount = document.getElementById('queueCount');
  const tweetsCount = document.getElementById('tweetsCount');
  const accountName = document.getElementById('accountName');
  const accountHandle = document.getElementById('accountHandle');
  const accountStatus = document.getElementById('accountStatus');
  const tweetsList = document.getElementById('tweetsList');
  const refreshTweetsBtn = document.getElementById('refreshTweetsBtn');
  const activityLog = document.getElementById('activityLog');
  const clearLogBtn = document.getElementById('clearLogBtn');
  const scanNowBtn = document.getElementById('scanNowBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const testReplyBtn = document.getElementById('testReplyBtn');
  const exportLogBtn = document.getElementById('exportLogBtn');

  // Prompt tab
  const toneBtns = document.querySelectorAll('.tone-btn');
  const language = document.getElementById('language');
  const customPromptSection = document.getElementById('customPromptSection');
  const customPrompt = document.getElementById('customPrompt');
  const replyTemplate = document.getElementById('replyTemplate');
  const previewInput = document.getElementById('previewInput');
  const previewBtn = document.getElementById('previewBtn');
  const previewContent = document.getElementById('previewContent');

  // Settings tab
  const apiKey = document.getElementById('apiKey');
  const toggleKeyBtn = document.getElementById('toggleKeyBtn');
  const baseUrl = document.getElementById('baseUrl');
  const model = document.getElementById('model');
  const customModelGroup = document.getElementById('customModelGroup');
  const customModel = document.getElementById('customModel');
  const testApiBtn = document.getElementById('testApiBtn');
  const apiStatus = document.getElementById('apiStatus');
  const maxPerHour = document.getElementById('maxPerHour');
  const delayMin = document.getElementById('delayMin');
  const delayMax = document.getElementById('delayMax');
  const prioritizeSamePost = document.getElementById('prioritizeSamePost');
  const myUsernameInput = document.getElementById('myUsernameInput');
  const blacklist = document.getElementById('blacklist');
  const skipReplies = document.getElementById('skipReplies');
  const skipOwn = document.getElementById('skipOwn');
  const humanTyping = document.getElementById('humanTyping');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const resetBtn = document.getElementById('resetBtn');
  const openOptionsBtn = document.getElementById('openOptionsBtn');
  const importFile = document.getElementById('importFile');
  const saveBtn = document.getElementById('saveBtn');

  let currentTone = 'friendly';

  // ---- Load Config ----
  async function loadConfig() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getConfig' }, (res) => {
        config = res?.config || {};
        resolve(config);
      });
    });
  }

  function populateUI() {
    // Toggle
    toggleEnabled.checked = config.enabled;
    updateStatus(config.enabled);

    // Stats
    todayCount.textContent = config.stats?.todayReplies || 0;
    totalCount.textContent = config.stats?.totalReplies || 0;
    queueCount.textContent = config.commentQueue?.length || config.queue?.length || 0;
    tweetsCount.textContent = config.myTweets?.length || 0;

    // Hourly count
    const hourlyEl = document.getElementById('hourlyCount');
    if (hourlyEl) hourlyEl.textContent = config.hourlyCount || 0;

    // Tweets list
    renderTweetsList();

    // Prompt tab
    currentTone = config.replyTone || 'friendly';
    toneBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tone === currentTone));
    customPromptSection.style.display = currentTone === 'custom' ? 'block' : 'none';
    language.value = config.replyLanguage || 'vi';
    customPrompt.value = config.customTone || '';
    replyTemplate.value = config.replyTemplate || '';

    // Settings tab
    apiKey.value = config.openaiApiKey || '';
    baseUrl.value = config.openaiBaseUrl || 'https://api.openai.com/v1';
    const modelOption = Array.from(model.options).find(o => o.value === config.openaiModel);
    if (modelOption) {
      model.value = config.openaiModel;
    } else {
      model.value = 'custom';
      customModel.value = config.openaiModel || '';
      customModelGroup.style.display = 'block';
    }
    maxPerHour.value = config.maxRepliesPerHour || 10;
    delayMin.value = config.delayMin || 60;
    delayMax.value = config.delayMax || 120;
    prioritizeSamePost.checked = config.prioritizeSamePost !== false;
    blacklist.value = (config.blacklistKeywords || []).join(', ');
    skipReplies.checked = config.skipReplies !== false;
    skipOwn.checked = config.skipOwnReplies !== false;
    humanTyping.checked = config.humanTyping !== false;
    myUsernameInput.value = config.myUsername || '';

    // System prompt
    const systemPromptInput = document.getElementById('systemPromptInput');
    if (systemPromptInput) systemPromptInput.value = config.systemPrompt || '';

    // New smart settings
    const smartSkipEl = document.getElementById('smartSkip');
    const humanImpEl = document.getElementById('humanImperfections');
    const smartTimingEl = document.getElementById('smartTiming');
    const skipChanceEl = document.getElementById('skipChance');
    if (smartSkipEl) smartSkipEl.checked = config.smartSkip !== false;
    if (humanImpEl) humanImpEl.checked = config.humanImperfections !== false;
    if (smartTimingEl) smartTimingEl.checked = config.smartTiming !== false;
    if (skipChanceEl) skipChanceEl.value = Math.round((config.skipChance || 0.12) * 100);

    // Activity logs
    activityLogs = config.activityLogs || [];
    renderLogs();
  }

  // ---- Init ----
  await loadConfig();
  populateUI();

  // ---- Tab Switching ----
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // ---- Toggle ----
  toggleEnabled.addEventListener('change', async () => {
    config.enabled = toggleEnabled.checked;
    await saveConfig({ enabled: config.enabled });
    updateStatus(config.enabled);
    addLog(config.enabled ? '🟢 Auto Reply đã BẬT' : '🔴 Auto Reply đã TẮT',
      config.enabled ? 'success' : 'error');

    // Notify content script
    chrome.runtime.sendMessage({ action: 'saveConfig', data: { enabled: config.enabled } });
  });

  function updateStatus(enabled) {
    statusText.textContent = enabled ? 'Đang hoạt động' : 'Đã tắt';
    statusText.className = `status-text ${enabled ? 'active' : 'inactive'}`;
  }

  // ---- Tone Selection ----
  toneBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toneBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTone = btn.dataset.tone;
      customPromptSection.style.display = currentTone === 'custom' ? 'block' : 'none';
    });
  });

  // ---- Preview ----
  previewBtn.addEventListener('click', async () => {
    const comment = previewInput.value.trim();
    if (!comment) {
      previewContent.textContent = 'Nhập comment thử để preview...';
      return;
    }

    previewContent.innerHTML = '<span class="autoreply-processing"></span> Đang tạo reply...';

    // Lưu config tạm thời với tone/prompt hiện tại trước khi preview
    const tempData = {
      replyTone: currentTone,
      customTone: customPrompt.value.trim(),
      replyLanguage: language.value,
      replyTemplate: replyTemplate.value.trim()
    };
    await saveConfig(tempData);

    chrome.runtime.sendMessage({
      action: 'generateReply',
      comment: comment,
      tweetContext: ''
    }, (res) => {
      if (res?.reply) {
        const len = res.reply.length;
        const limit = 280;
        const color = len > limit ? 'red' : len > 200 ? 'orange' : '#4ade80';
        previewContent.innerHTML = `
          <div>${res.reply}</div>
          <div style="margin-top:8px;font-size:11px;color:${color};text-align:right;">
            ${len}/${limit} ký tự
          </div>
        `;
      } else {
        previewContent.textContent = `❌ ${res?.error || 'Lỗi tạo reply'}`;
      }
    });
  });

  // ---- Model Selection ----
  model.addEventListener('change', () => {
    customModelGroup.style.display = model.value === 'custom' ? 'block' : 'none';
  });

  // ---- API Key Visibility ----
  toggleKeyBtn.addEventListener('click', () => {
    apiKey.type = apiKey.type === 'password' ? 'text' : 'password';
  });

  // ---- Test API ----
  testApiBtn.addEventListener('click', async () => {
    const key = apiKey.value.trim();
    if (!key) {
      apiStatus.textContent = '❌ Nhập API key trước';
      apiStatus.className = 'api-status error';
      return;
    }

    apiStatus.textContent = '🔄 Đang test...';
    apiStatus.className = 'api-status testing';

    const url = baseUrl.value.trim() || 'https://api.openai.com/v1';
    chrome.runtime.sendMessage({ action: 'testApiKey', apiKey: key, baseUrl: url }, (res) => {
      if (res?.success) {
        apiStatus.textContent = '✅ Kết nối thành công!';
        apiStatus.className = 'api-status success';
        addLog('✅ API key hợp lệ', 'success');
      } else {
        apiStatus.textContent = `❌ ${res?.error || 'Lỗi'}`;
        apiStatus.className = 'api-status error';
        addLog(`❌ API error: ${res?.error}`, 'error');
      }
    });
  });

  // ---- Quick Actions ----
  scanNowBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'scanNow' });
        addLog('🔍 Đang quét comment...', 'info');
        showToast('🔍 Đang quét...', 'info');
      }
    });
  });

  pauseBtn.addEventListener('click', async () => {
    config.enabled = !config.enabled;
    toggleEnabled.checked = config.enabled;
    await saveConfig({ enabled: config.enabled });
    updateStatus(config.enabled);
    pauseBtn.querySelector('.action-icon').textContent = config.enabled ? '⏸️' : '▶️';
    pauseBtn.querySelector('span:last-child').textContent = config.enabled ? 'Tạm dừng' : 'Tiếp tục';
    addLog(config.enabled ? '▶️ Tiếp tục' : '⏸️ Tạm dừng', 'info');
  });

  testReplyBtn.addEventListener('click', () => {
    // Switch to prompt tab and focus preview
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));
    document.querySelector('[data-tab="prompt"]').classList.add('active');
    document.getElementById('tab-prompt').classList.add('active');
    previewInput.focus();
    showToast('✏️ Nhập comment thử ở tab Prompt', 'info');
  });

  exportLogBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(activityLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autoreply-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('📤 Đã export logs', 'success');
    showToast('📤 Đã export logs', 'success');
  });

  clearLogBtn.addEventListener('click', () => {
    activityLogs = [];
    renderLogs();
    saveConfig({ activityLogs: [] });
  });

  // ---- Data Management ----
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'twitter-autoreply-config.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('📤 Đã export config', 'success');
  });

  importBtn.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        config = { ...config, ...imported };
        chrome.runtime.sendMessage({ action: 'saveConfig', data: config }, (res) => {
          if (res?.success) {
            populateUI();
            showToast('📥 Import thành công!', 'success');
            addLog('📥 Đã import config', 'success');
          }
        });
      } catch {
        showToast('❌ File không hợp lệ', 'error');
      }
    };
    reader.readAsText(file);
  });

  resetBtn.addEventListener('click', () => {
    if (confirm('Xóa tất cả cài đặt và thống kê?')) {
      chrome.runtime.sendMessage({ action: 'clearStats' }, (res) => {
        if (res?.success) {
          showToast('🗑️ Đã reset!', 'success');
          addLog('🗑️ Đã reset tất cả', 'error');
          setTimeout(() => location.reload(), 800);
        }
      });
    }
  });

  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ---- Save ----
  saveBtn.addEventListener('click', async () => {
    const selectedModel = model.value === 'custom' ? customModel.value.trim() : model.value;
    if (!selectedModel) {
      showToast('❌ Chọn model', 'error');
      return;
    }

    const blacklistKeywords = blacklist.value
      .split(',').map(k => k.trim()).filter(k => k);

    const newData = {
      openaiApiKey: apiKey.value.trim(),
      openaiBaseUrl: baseUrl.value.trim() || 'https://api.openai.com/v1',
      openaiModel: selectedModel,
      replyLanguage: language.value,
      replyTone: currentTone,
      customTone: customPrompt.value.trim(),
      replyTemplate: replyTemplate.value.trim(),
      systemPrompt: document.getElementById('systemPromptInput')?.value?.trim() || '',
      maxRepliesPerHour: parseInt(maxPerHour.value) || 10,
      delayMin: parseInt(delayMin.value) || 60,
      delayMax: parseInt(delayMax.value) || 120,
      prioritizeSamePost: prioritizeSamePost.checked,
      myUsername: myUsernameInput.value.trim().replace('@', '').toLowerCase(),
      blacklistKeywords,
      skipReplies: skipReplies.checked,
      skipOwnReplies: skipOwn.checked,
      humanTyping: humanTyping.checked,
      smartSkip: document.getElementById('smartSkip')?.checked ?? true,
      humanImperfections: document.getElementById('humanImperfections')?.checked ?? true,
      smartTiming: document.getElementById('smartTiming')?.checked ?? true,
      skipChance: (parseInt(document.getElementById('skipChance')?.value) || 12) / 100
    };

    await saveConfig(newData);
    showToast('💾 Đã lưu cài đặt!', 'success');
    addLog('💾 Đã lưu cài đặt', 'success');
  });

  // ---- Refresh Tweets ----
  refreshTweetsBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'scanMyTweets' });
        showToast('🔄 Đang quét bài viết...', 'info');
        addLog('🔄 Quét lại bài viết', 'info');
      }
    });
  });

  // ---- Render Tweets List ----
  function renderTweetsList() {
    const tweets = config.myTweets || [];
    if (tweets.length === 0) {
      tweetsList.innerHTML = '<div class="log-empty">Chưa tìm thấy bài viết nào. Mở Twitter và bấm Quét lại.</div>';
      return;
    }

    tweetsList.innerHTML = tweets.map((tweet, i) => {
      const text = tweet.text?.substring(0, 80) + (tweet.text?.length > 80 ? '...' : '');
      const badge = i === 0
        ? '<span class="tweet-badge newest">🔥 Mới nhất</span>'
        : `<span class="tweet-badge tracking">📌 #${i + 1}</span>`;
      return `
        <div class="tweet-item">
          <span class="tweet-num">${i + 1}</span>
          <span class="tweet-text">${text}</span>
          ${badge}
        </div>
      `;
    }).join('');
  }

  // ---- Helpers ----
  async function saveConfig(data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'saveConfig', data }, (res) => {
        config = { ...config, ...data };
        resolve(res);
      });
    });
  }

  function addLog(message, type = 'info') {
    const now = new Date();
    const time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    activityLogs.unshift({ time, message, type });
    if (activityLogs.length > MAX_LOGS) activityLogs = activityLogs.slice(0, MAX_LOGS);

    renderLogs();

    // Save logs (debounced)
    clearTimeout(addLog._saveTimeout);
    addLog._saveTimeout = setTimeout(() => {
      saveConfig({ activityLogs });
    }, 2000);
  }

  function renderLogs() {
    if (activityLogs.length === 0) {
      activityLog.innerHTML = '<div class="log-empty">Chưa có hoạt động nào</div>';
      return;
    }

    activityLog.innerHTML = activityLogs.map(log => `
      <div class="log-item">
        <span class="log-time">${log.time}</span>
        <span class="log-msg ${log.type}">${log.message}</span>
      </div>
    `).join('');
  }

  function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ---- Listen for background messages ----
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'statsUpdate') {
      todayCount.textContent = msg.stats?.todayReplies || 0;
      totalCount.textContent = msg.stats?.totalReplies || 0;
      queueCount.textContent = msg.queue || 0;
      tweetsCount.textContent = msg.tweets || 0;
      const hourlyEl = document.getElementById('hourlyCount');
      if (hourlyEl) hourlyEl.textContent = msg.hourlyCount || 0;
    }
    if (msg.action === 'replyPosted') {
      const analysisInfo = msg.analysis ? ` [${msg.analysis.commentType}/${msg.analysis.sentiment}]` : '';
      addLog(`✅ Đã reply @${msg.username}: "${msg.reply?.substring(0, 40)}..."${analysisInfo}`, 'success');
    }
    if (msg.action === 'replyError') {
      addLog(`❌ Lỗi reply: ${msg.error}`, 'error');
    }
    if (msg.action === 'logMessage') {
      addLog(msg.message, msg.type || 'info');
    }
    if (msg.action === 'accountDetected') {
      if (msg.username) {
        accountHandle.textContent = `@${msg.username}`;
        accountName.textContent = msg.displayName || msg.username;
        accountStatus.textContent = '✅';
        accountStatus.className = 'account-status detected';
        addLog(`👤 Phát hiện tài khoản: @${msg.username}${msg.displayName ? ` (${msg.displayName})` : ''}`, 'success');
      }
    }
  });

  // ---- Periodic stats refresh ----
  setInterval(async () => {
    chrome.runtime.sendMessage({ action: 'getStats' }, (res) => {
      if (res?.stats) {
        todayCount.textContent = res.stats.todayReplies || 0;
        totalCount.textContent = res.stats.totalReplies || 0;
        queueCount.textContent = res.queue || 0;
        tweetsCount.textContent = res.tweets || 0;
      }
      const hourlyEl = document.getElementById('hourlyCount');
      if (hourlyEl) hourlyEl.textContent = res?.hourlyCount || 0;
      // Update account info
      if (res?.myUsername) {
        accountHandle.textContent = `@${res.myUsername}`;
        accountName.textContent = res.myDisplayName || res.myUsername;
        accountStatus.textContent = '✅';
        accountStatus.className = 'account-status detected';
      } else {
        accountHandle.textContent = '@...';
        accountName.textContent = 'Đang detect...';
        accountStatus.textContent = '⏳';
        accountStatus.className = 'account-status unknown';
      }
    });
    // Refresh tweets list
    chrome.runtime.sendMessage({ action: 'getConfig' }, (res) => {
      if (res?.config?.myTweets) {
        config.myTweets = res.config.myTweets;
        renderTweetsList();
      }
    });
  }, 5000);
});
