// ===================================================
// Twitter Auto Reply - Options Script
// ===================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Load config
  chrome.runtime.sendMessage({ action: 'getConfig' }, (res) => {
    if (!res?.config) return;
    const cfg = res.config;

    document.getElementById('optApiKey').value = cfg.openaiApiKey || '';
    document.getElementById('optBaseUrl').value = cfg.openaiBaseUrl || 'https://api.openai.com/v1';
    document.getElementById('optModel').value = cfg.openaiModel || 'gpt-5.4-mini';
    document.getElementById('optSystemPrompt').value = cfg.systemPrompt || '';
    document.getElementById('optTemplate').value = cfg.replyTemplate || '';
    document.getElementById('optMaxDaily').value = cfg.maxDailyReplies || (cfg.maxRepliesPerHour * 24) || 100;
    document.getElementById('optMaxHourly').value = cfg.maxRepliesPerHour || 10;
    document.getElementById('optMinDelay').value = cfg.delayMin || 60;
  });

  // Load stats
  chrome.runtime.sendMessage({ action: 'getStats' }, (res) => {
    if (res?.stats) {
      document.getElementById('statToday').textContent = res.stats.todayReplies || 0;
      document.getElementById('statTotal').textContent = res.stats.totalReplies || 0;
      document.getElementById('statErrors').textContent = res.stats.errors || 0;
    }
  });

  // Save
  document.getElementById('saveAllBtn').addEventListener('click', () => {
    const cfg = {
      openaiApiKey: document.getElementById('optApiKey').value.trim(),
      openaiBaseUrl: document.getElementById('optBaseUrl').value.trim() || 'https://api.openai.com/v1',
      openaiModel: document.getElementById('optModel').value.trim() || 'gpt-5.4-mini',
      systemPrompt: document.getElementById('optSystemPrompt').value.trim(),
      replyTemplate: document.getElementById('optTemplate').value.trim(),
      maxDailyReplies: parseInt(document.getElementById('optMaxDaily').value) || 100,
      maxRepliesPerHour: parseInt(document.getElementById('optMaxHourly').value) || 10,
      delayMin: parseInt(document.getElementById('optMinDelay').value) || 60
    };

    chrome.runtime.sendMessage({ action: 'saveConfig', data: cfg }, (res) => {
      if (res?.success) showToast('✅ Đã lưu!', 'success');
      else showToast('❌ Lỗi lưu', 'error');
    });
  });

  // Export
  document.getElementById('exportBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'getConfig' }, (res) => {
      const blob = new Blob([JSON.stringify(res.config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'twitter-autoreply-config.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  // Import
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const cfg = JSON.parse(reader.result);
        chrome.runtime.sendMessage({ action: 'saveConfig', data: cfg }, (res) => {
          if (res?.success) {
            showToast('✅ Import thành công!', 'success');
            setTimeout(() => location.reload(), 1000);
          }
        });
      } catch {
        showToast('❌ File không hợp lệ', 'error');
      }
    };
    reader.readAsText(file);
  });

  // Reset
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Xóa tất cả cài đặt và thống kê?')) {
      chrome.runtime.sendMessage({ action: 'clearStats' }, (res) => {
        if (res?.success) {
          showToast('✅ Đã reset!', 'success');
          setTimeout(() => location.reload(), 1000);
        }
      });
    }
  });

  function showToast(msg, type) {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
  }
});
