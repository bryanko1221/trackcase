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

  // source-status.json is the single authoritative timestamp source.
  // Never fall back to a timestamp embedded in index.html or another dataset.
  const url = 'data/source-status.json?fresh=' + Date.now();
  fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      const stamp = formatTaiwan(data.lastScheduledCheck);
      if (stamp) el.textContent = stamp;
      if (typeof showCompleteness === 'function') showCompleteness(data);
    })
    .catch(() => {
      el.textContent = '無法取得最新時間';
      const box = document.getElementById('scanCompleteness');
      if (box) box.textContent = '🟡 無法取得最新掃描狀態';
    });
})();
