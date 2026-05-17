// ===================================================
// Twitter Auto Reply - Popup Script
// ===================================================

document.addEventListener('DOMContentLoaded', async () => {
  // ---- Elements ----
  const toggleEnabled = document.getElementById('toggleEnabled');
  const apiKey = document.getElementById('apiKey');
  const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
  const apiStatus = document.getElementById('apiStatus');
  const model = document.getElementById('model');
  const customModelGroup = document.getElementById('customModelGroup');
  const customModel = document.getElementById('customModel');
  const language = document.getElementById('language');
  const toneBtns = document.querySelectorAll('.tone-btn');
  const customToneGroup = document.getElementById('customToneGroup');
  const customTone = document.getElementById('customTone');
  const maxPerHour = document.getElementById('maxPerHour');
  const delay = document.getElementById('delay');
  const blacklist = document.getElementById('blacklist');
  const skipReplies = document.getElementById('skipReplies');
  const skipOwn = document.getElementById('skipOwn');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const optionsBtn = document.getElementById('optionsBtn');

  // Stats elements
  const todayReplies = document.getElementById('todayReplies');
  const totalReplies = document.getElementById('totalReplies');
  const queueCount = document.getElementById('queueCount');

  let currentTone = 'friendly';
  let currentConfig = {};

  // ---- Load Config ----
  chrome.runtime.sendMessage({ action: 'getConfig' }, (res) => {
    if (!res?.config) return;
    const cfg = res.config;
    currentConfig = cfg;

    toggleEnabled.checked = cfg.enabled;
    apiKey.value = cfg.openaiApiKey || '';
    language.value = cfg.replyLanguage || 'vi';
    maxPerHour.value = cfg.maxRepliesPerHour || 10;
    delay.value = cfg.delayBetweenReplies || 30;
    blacklist.value = (cfg.blacklistKeywords || []).join(', ');
    skipReplies.checked = cfg.skipReplies !== false;
    skipOwn.checked = cfg.skipOwnReplies !== false;
    customTone.value = cfg.customTone || '';

    // Model
    const modelOption = Array.from(model.options).find(o => o.value === cfg.openaiModel);
    if (modelOption) {
      model.value = cfg.openaiModel;
    } else {
      model.value = 'custom';
      customModel.value = cfg.openaiModel;
      customModelGroup.style.display = 'block';
    }

    // Tone
    currentTone = cfg.replyTone || 'friendly';
    toneBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tone === currentTone);
    });
    if (currentTone === 'custom') customToneGroup.style.display = 'block';

    updateStatus(cfg.enabled);
  });

  // ---- Load Stats ----
  chrome.runtime.sendMessage({ action: 'getStats' }, (res) => {
    if (res?.stats) {
      todayReplies.textContent = res.stats.todayReplies || 0;
      totalReplies.textContent = res.stats.totalReplies || 0;
      queueCount.textContent = res.queue || 0;
    }
  });

  // ---- Event Listeners ----
  toggleEnabled.addEventListener('change', () => {
    updateStatus(toggleEnabled.checked);
  });

  toggleKeyVisibility.addEventListener('click', () => {
    apiKey.type = apiKey.type === 'password' ? 'text' : 'password';
  });

  model.addEventListener('change', () => {
    customModelGroup.style.display = model.value === 'custom' ? 'block' : 'none';
  });

  toneBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toneBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTone = btn.dataset.tone;
      customToneGroup.style.display = currentTone === 'custom' ? 'block' : 'none';
    });
  });

  // ---- Save ----
  saveBtn.addEventListener('click', async () => {
    const selectedModel = model.value === 'custom' ? customModel.value.trim() : model.value;
    if (!selectedModel) {
      showToast('❌ Vui lòng chọn model', 'error');
      return;
    }

    const blacklistKeywords = blacklist.value
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const cfg = {
      enabled: toggleEnabled.checked,
      openaiApiKey: apiKey.value.trim(),
      openaiModel: selectedModel,
      replyLanguage: language.value,
      replyTone: currentTone,
      customTone: customTone.value.trim(),
      maxRepliesPerHour: parseInt(maxPerHour.value) || 10,
      delayBetweenReplies: parseInt(delay.value) || 30,
      blacklistKeywords,
      skipReplies: skipReplies.checked,
      skipOwnReplies: skipOwn.checked
    };

    chrome.runtime.sendMessage({ action: 'saveConfig', data: cfg }, (res) => {
      if (res?.success) {
        showToast('✅ Đã lưu cài đặt!');
        currentConfig = { ...currentConfig, ...cfg };
      } else {
        showToast('❌ Lỗi lưu cài đặt', 'error');
      }
    });
  });

  // ---- Test API ----
  testBtn.addEventListener('click', async () => {
    const key = apiKey.value.trim();
    if (!key) {
      showToast('❌ Nhập API key trước', 'error');
      return;
    }

    apiStatus.textContent = '🔄 Đang test...';
    apiStatus.className = 'api-status testing';

    const baseUrl = currentConfig.openaiBaseUrl || 'https://api.openai.com/v1';
    chrome.runtime.sendMessage({ action: 'testApiKey', apiKey: key, baseUrl }, (res) => {
      if (res?.success) {
        apiStatus.textContent = '✅ API key hợp lệ';
        apiStatus.className = 'api-status success';
      } else {
        apiStatus.textContent = `❌ ${res?.error || 'Lỗi không xác định'}`;
        apiStatus.className = 'api-status error';
      }
    });
  });

  // ---- Options ----
  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ---- Helpers ----
  function updateStatus(enabled) {
    const statusBar = document.getElementById('statusBar');
    statusBar.className = `status-bar ${enabled ? 'active' : 'inactive'}`;
  }

  function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.querySelector('.popup').appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
});
