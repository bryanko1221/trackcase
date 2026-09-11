(() => {
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  const formatTaiwan = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 16).replace('T', ' ');
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(d).replaceAll('/', '-');
  };
  const showCompleteness = (data) => {
    const state = data.scanCompleteness || {};
    let box = document.getElementById('scanCompleteness');
    if (!box) {
      box = document.createElement('div');
      box.id = 'scanCompleteness';
      box.style.cssText = 'margin-top:6px;font-size:12px;font-weight:700';
      const parent = el.parentElement;
      if (parent) parent.appendChild(box);
    }
    box.textContent = state.label || '🟡 尚未完成完整度驗證';
    box.title = (state.reasons || []).join('\n') || '已通過嚴格完整度閘門';
  };
  // Add both a timestamp and a random query value. This avoids stale GitHub Pages/Safari
  // responses while source-status.json remains the single authority for scan time/status.
  const url = 'data/source-status.json?ts=' + Date.now() + '&r=' + Math.random().toString(36).slice(2);
  fetch(url, { cache: 'no-store', credentials: 'same-origin', headers: { 'Cache-Control': 'no-cache' } })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(data => {
      const stamp = formatTaiwan(data.lastScheduledCheck || data.lastUpdated);
      if (stamp) el.textContent = stamp;
      showCompleteness(data);
    })
    .catch(() => {
      const box = document.getElementById('scanCompleteness');
      if (box) box.textContent = '🟡 無法取得最新掃描狀態';
    });
})();
