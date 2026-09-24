(() => {
  const el = document.getElementById('lastUpdated');
  if (!el) return;

  const formatTaiwan = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d).replaceAll('/', '-');
  };

  // 唯一權威來源：data/source-status.json。
  // HTML 絕不保留舊日期，避免 Safari / GitHub Pages 快取顯示過期時間。
  const loadLatestStatus = async () => {
    const url = 'data/source-status.json?v=' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  };

  loadLatestStatus()
    .then(data => {
      const stamp = formatTaiwan(data.lastScheduledCheck || data.lastUpdated);
      el.textContent = stamp || '無有效掃描時間';
      if (typeof showCompleteness === 'function') showCompleteness(data);
    })
    .catch(() => {
      el.textContent = '🔴 無法取得最新掃描時間';
      const box = document.getElementById('scanCompleteness');
      if (box) box.textContent = '🟡 無法取得最新掃描狀態';
    });
})();
