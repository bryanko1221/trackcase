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
  // Always read the live status file with cache-busting. The live scan timestamp
  // is authoritative; the timestamp embedded in index.html is only a fallback.
  const url = 'data/source-status.json?ts=' + Date.now() + '&v=' + Math.random();
  fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Cache-Control': 'no-cache' }
  })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(data => {
      const stamp = formatTaiwan(data.lastScheduledCheck || data.lastUpdated);
      if (stamp) el.textContent = stamp;
    })
    .catch(() => {});
})();
