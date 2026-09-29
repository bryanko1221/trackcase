let listings=[],sourceMeta={},scanMeta={},transactionData=[];
const SOURCES=['591','信義','樂屋','永慶','中信','住商','台灣房屋','好房網','樂居'];
const MONITORED=['板橋新巨蛋','板橋文化勳章','板橋公園世紀','欣璞綻','綠如意','鑑築','榮耀交響曲','佳元植','板橋千禧園','板橋吉祥花園','雙喜臨門','板橋晴','永康芬揚'];
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const money=n=>n==null?'—':Number(n).toLocaleString('zh-TW')+'萬';
const SOLD_KEY='trackcase_sold_tracking_v1';
let soldTracking={};
function loadSoldTracking(){try{soldTracking=JSON.parse(localStorage.getItem(SOLD_KEY)||'{}')||{}}catch(e){soldTracking={}}}
function saveSoldTracking(){try{localStorage.setItem(SOLD_KEY,JSON.stringify(soldTracking))}catch(e){console.warn('成交追蹤儲存失敗',e)}}
function soldState(x){return soldTracking[x.id]||{sold:false,knownPrice:null,soldDate:'',regStatus:'pending',regPrice:null,regDate:'',regAddress:'',note:''}}
function soldBadge(x){const s=soldState(x);if(!s.sold)return '';if(s.regStatus==='verified')return '<span class="status-badge">✅ 實登已核實</span>';if(s.regStatus==='mismatch')return '<span class="status-badge">⚠️ 實登金額不符</span>';return '<span class="status-badge">🟠 已成交・待實登</span>'}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const status=x=>x.status||'active';
const statusText=x=>({active:'🟢 在售',price_drop:'🔻 降價',price_up:'🔺 漲價',gone_pending:'⚠️ 下架待確認',sold_pending:'⚠️ 消失／下架／狀態變更',registered:'✅ 已完成實登'}[status(x)]||'🟢 在售');
const communityKey=v=>{if(!v)return v;const s=String(v).replace(/\s+/g,'');if(/^板橋公園世紀(?:A區|B區|C區|D區)$/.test(s))return '板橋公園世紀';const aliases={'板橋欣璞綻':'欣璞綻','板橋綠如意':'綠如意','板橋鑑築':'鑑築','板橋榮耀交響曲':'榮耀交響曲','板橋佳元植':'佳元植','板橋千禧園':'板橋千禧園','板橋吉祥花園':'板橋吉祥花園','板橋雙喜臨門':'雙喜臨門','板橋晴':'板橋晴','板橋新巨蛋':'板橋新巨蛋','板橋文化勳章':'板橋文化勳章','板橋公園世紀':'板橋公園世紀','板橋公園世紀A區':'板橋公園世紀','板橋公園世紀B區':'板橋公園世紀','板橋公園世紀C區':'板橋公園世紀','板橋公園世紀D區':'板橋公園世紀'};return aliases[s]||s};
const blockKey=v=>{if(!v)return'';const s=String(v).replace(/\s+/g,'');return ['B/C區','B、C區','B、C'].includes(s)?'BC':s};
const sameBlock=(a,b)=>{const x=blockKey(a),y=blockKey(b);return x===y||(x==='BC'&&(y==='B區'||y==='C區'))||(y==='BC'&&(x==='B區'||x==='C區'))};
const layoutKey=v=>{const m=String(v||'').replace(/\s/g,'').match(/(\d+)房/);return m?m[1]+'房':String(v||'')};
const blockRank=b=>({A區:1,B區:2,'B/C區':2,C區:3,D區:4,'棟別待確認':9,'待確認':9})[b]||8;
function validListingUrl(p,u){if(!u)return false;try{const s=new URL(u).hostname+new URL(u).pathname;if(p.startsWith('591'))return /sale\.591\.com\.tw\/home\/house\/detail\//.test(s);if(p==='信義')return /sinyi\.com\.tw\/buy\/house\//.test(s);if(p.startsWith('樂屋'))return /rakuya\.com\.tw\/.*\/sell\/info/.test(s);if(p==='永慶')return /yungching\.com\.tw\/house\//.test(s);if(p==='好房網')return /housefun\.com\.tw\/.*(?:house|buy)/i.test(s);if(p==='中信')return /cthouse\.com\.tw\/house\//i.test(s);if(p==='台灣房屋')return /twhg\.com\.tw\/buy\//i.test(s);return true}catch(e){return false}}
function cleanLinks(x){return Object.entries(x.links||{}).filter(([p,u])=>u&&validListingUrl(p,u)).sort((a,b)=>SOURCES.indexOf(a[0])-SOURCES.indexOf(b[0]))}
function linkHtml(x){return cleanLinks(x).map(([p,u])=>`<a href="${u}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${p}</a>`).join('')}
function merge(a,b){const newer=String(b.updated||'')>=String(a.updated||'')?b:a,older=newer===a?b:a;return {...older,...newer,sources:{...(a.sources||{}),...(b.sources||{})},links:{...(a.links||{}),...(b.links||{})}}}
function normalizeUrl(u){try{const z=new URL(u);z.hostname=z.hostname.replace(/^www\./,'');z.hash='';z.search='';return z.toString().replace(/\/$/,'')}catch(e){return String(u||'')}} function identityStrong(a,b){if(a.groupId&&b.groupId&&a.groupId===b.groupId)return true;const al=Object.values(a.links||{}).map(normalizeUrl),bl=Object.values(b.links||{}).map(normalizeUrl);if(al.some(u=>u&&bl.includes(u)))return true;if(a.address&&b.address&&String(a.address).replace(/\s/g,'')===String(b.address).replace(/\s/g,''))return true;if(a.propertyIds&&b.propertyIds&&Object.values(a.propertyIds).some(v=>v&&Object.values(b.propertyIds).includes(v)))return true;if(communityKey(a.community)==='板橋公園世紀'&&communityKey(b.community)==='板橋公園世紀'&&a.floor!=null&&b.floor!=null&&a.floor===b.floor&&a.area!=null&&b.area!=null&&Math.abs(a.area-b.area)<0.01&&layoutKey(a.layout)===layoutKey(b.layout)&&a.price!=null&&b.price!=null&&a.price===b.price&&a.parking===b.parking)return true;return false}
function dedupe(arr){const out=[];for(const raw of arr){const x={...raw,community:communityKey(raw.community)};if(!['active','price_drop','price_up'].includes(status(x))){out.push(x);continue}let i=out.findIndex(y=>['active','price_drop','price_up'].includes(status(y))&&communityKey(y.community)===x.community&&sameBlock(y.block,x.block)&&y.floor===x.floor&&y.parking===x.parking&&layoutKey(y.layout)===layoutKey(x.layout)&&((y.area==null||x.area==null)||Math.abs(y.area-x.area)<=1));if(i>=0){if(identityStrong(x,out[i]))out[i]=merge(out[i],x);else out.push(x)}else out.push(x)}return out}
function sortData(a){const s=$('#sortFilter')?.value||'default';return [...a].sort((x,y)=>s==='priceAsc'?(x.price??999999)-(y.price??999999):s==='priceDesc'?(y.price??0)-(x.price??0):s==='unitAsc'?(x.unit??999)-(y.unit??999):s==='unitDesc'?(y.unit??0)-(x.unit??0):s==='updatedDesc'?String(y.updated||'').localeCompare(String(x.updated||'')):(blockRank(x.block)-blockRank(y.block))||((y.floor??-1)-(x.floor??-1)))}
function inRange(v,s){return s==='all'||(v!=null&&v>=+s.split('-')[0]&&v<=+s.split('-')[1])}
function filtered(){const k=$('#keyword')?.value.trim().toLowerCase()||'',c=$('#buildingFilter')?.value||'all',b=$('#blockFilter')?.value||'all',p=$('#priceFilter')?.value||'all',a=$('#areaFilter')?.value||'all',l=$('#layoutFilter')?.value||'all',pk=$('#parkingFilter')?.value||'all',st=$('#statusFilter')?.value||'all';return listings.filter(x=>(!k||[x.community,x.block,x.layout,x.id,x.address,x.agent,...Object.values(x.propertyIds||{})].join(' ').toLowerCase().includes(k))&&(c==='all'||communityKey(x.community)===c)&&(b==='all'||x.block===b)&&inRange(x.price,p)&&inRange(x.area,a)&&(l==='all'||String(x.layout||'').startsWith(l))&&(pk==='all'||(pk==='yes'?x.parking===true:x.parking===false))&&(st==='all'||(st==='active'&&['active','price_drop','price_up'].includes(status(x)))||status(x)===st))}
function badge(p,v){return `<span class="platform ${v?'':'off'}">${p} ${v?'●':'○'}</span>`}
function healthMeta(x){
  const vals=Object.entries(x.sourceValidation||{});
  if(!vals.length)return {ok:0,unknown:0,gone:0,total:0};
  let ok=0,unknown=0,gone=0;
  vals.forEach(([p,v])=>{const s=v?.state;if(s==='active')ok++;else if(s==='gone'||s==='not-currently-listed')gone++;else unknown++;});
  return {ok,unknown,gone,total:vals.length};
}
function healthLabel(x){
  const h=healthMeta(x);
  if(!h.total)return '⚪ 尚未核驗';
  if(h.gone===h.total)return '🔴 全部失效';
  if(h.gone>0)return '🟠 部分下架';
  if(h.unknown>0)return '🟡 部分待核驗';
  return '🟢 全部可核驗';
}
function healthHtml(x){
  const h=healthMeta(x);
  const rows=Object.entries(x.sourceValidation||{}).map(([p,v])=>{
    const s=v?.state||'unknown';
    const icon=s==='active'?'🟢':(s==='gone'||s==='not-currently-listed'?'🔴':'🟡');
    const label=s==='active'?'可存取':(s==='gone'||s==='not-currently-listed'?'失效／下架':'待核驗');
    return '<div class="health-row"><span>'+esc(p)+'</span><b>'+icon+' '+label+'</b><small>'+(v?.httpStatus||'—')+'｜'+(v?.checkedAt?String(v.checkedAt).slice(0,16).replace('T',' '):'未記錄')+'</small></div>';
  }).join('');
  return '<div class="health-box"><div class="health-head"><b>🔗 網址健康狀態</b><span>'+healthLabel(x)+'</span></div><div class="health-summary">可存取 '+h.ok+'｜待核驗 '+h.unknown+'｜失效／下架 '+h.gone+'</div>'+ (rows||'<div class="muted">目前沒有逐平台網址核驗紀錄。</div>') +'</div>';
}
function historyHtml(x){
  const h=Array.isArray(x.history)?x.history.filter(v=>v&&v.price!=null).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))):[];
  if(!h.length)return '<div class="history-box"><div class="history-head"><b>📉 歷史價格</b></div><div class="muted">目前尚無已核實的歷史價格紀錄，不自行補猜。</div></div>';
  const rows=h.map(v=>'<div class="history-row"><span>'+esc(v.date||'—')+'</span><b>'+money(v.price)+'</b></div>').join('');
  return '<div class="history-box"><div class="history-head"><b>📉 歷史價格</b><span>共 '+h.length+' 筆</span></div><div class="history-current">目前開價 <b>'+money(x.price)+'</b></div>'+rows+'</div>';
}
function card(x){const ss=soldState(x);return `<article class="listing-card" data-id="${x.id}"><div class="listing-top"><div><div class="listing-title">${x.community}｜${x.block||'棟別待確認'} ${x.floor!=null?x.floor+'F':'樓層待確認'}</div><div class="listing-sub">${x.area??'—'}坪 · ${x.layout||'—'} · ${x.parking===null||x.parking===undefined?'車位待確認':x.parking?'有車位':'無車位'}</div></div><div>${x.new?'<span class="new">🆕 新增</span>':''}<span class="status-badge">${statusText(x)}</span>${soldBadge(x)}</div></div><div class="price">${money(x.price)} <span class="unit">${x.unit?x.unit+'萬/坪':'單價待核實'}</span></div><div class="facts"><div>樓層<b>${x.floor!=null?x.floor+'/'+(x.totalFloor||'-')+'F':'待確認'}</b></div><div>建物坪<b>${x.buildingArea??'待核實'}坪</b></div><div>車位<b>${x.parkingArea??'—'}坪</b></div><div>車位價<b>${x.parkingPrice?money(x.parkingPrice):'—'}</b></div><div>同案平台<b>${SOURCES.filter(p=>x.sources?.[p]).length} 個</b></div></div><div class="platforms">${SOURCES.map(p=>badge(p,x.sources?.[p])).join('')}</div><div class="source-direct"><span>🔗 原始案件：</span>${linkHtml(x)||'<span class="source-missing">尚未取得有效案件直連</span>'}</div>${healthHtml(x)}${historyHtml(x)}${x.agent?`<div class="muted">仲介：${x.agent}</div>`:''}${x.yq===true?'<div class="muted">永慶：🟢目前有掛售</div>':x.yq===false?'<div class="muted">永慶：🔴目前未確認掛售</div>':'<div class="muted">永慶：⚪尚未確認</div>'}${x.changeNote?`<div class="muted">${x.changeNote}</div>`:''}${x.verificationNote?`<div class="muted">核實：${x.verificationNote}</div>`:''}${x.photoStatus?`<div class="muted">照片：${x.photoStatus}</div>`:''}${ss.sold?`<div class="sold-note">成交追蹤：${money(ss.knownPrice)}｜${ss.soldDate||'日期未填'}｜${ss.regStatus==='verified'?'實登已核實':ss.regStatus==='mismatch'?'實登金額不符':'等待實登'}</div>`:''}<button type="button" class="sold-btn" onclick="event.stopPropagation();openSoldForm('${x.id}')">${ss.sold?'✏️ 修改成交追蹤':'📝 標記已成交'}</button></article>`}
let allViewMode='overview';
function ensureAllViewToggle(){
  const grid=$('#listingGrid');
  if(!grid)return;
  let bar=$('#allViewToggle');
  if(!bar){
    bar=document.createElement('div');
    bar.id='allViewToggle';
    grid.parentElement.insertBefore(bar,grid);
  }
  bar.innerHTML='<div class="all-view-label">全部案件顯示</div><div class="all-view-buttons">'+
    '<button type="button" class="'+(allViewMode==='overview'?'active':'')+'" data-viewmode="overview">▣ 社區總覽</button>'+
    '<button type="button" class="'+(allViewMode==='list'?'active':'')+'" data-viewmode="list">▤ 案件列表</button>'+
    '<button type="button" class="'+(allViewMode==='cards'?'active':'')+'" data-viewmode="cards">▦ 完整卡片</button></div>';
  bar.querySelectorAll('button').forEach(b=>b.onclick=()=>{allViewMode=b.dataset.viewmode;render()});
}
function compactRow(x){
  const price=money(x.price), unit=x.unit?x.unit+'萬/坪':'單價待核實';
  const floor=x.floor!=null?x.floor+'F':'樓層待確認';
  const statusClass=status(x)==='active'?'ok':status(x)==='price_drop'?'drop':status(x)==='price_up'?'up':'warn';
  return '<button type="button" class="listing-row" data-id="'+esc(x.id)+'">'+
    '<span class="row-block">'+esc(x.block||'棟別待確認')+'</span>'+
    '<span class="row-floor">'+esc(floor)+'</span>'+
    '<span class="row-area">'+esc((x.area??'—')+'坪')+'</span>'+
    '<span class="row-layout">'+esc(x.layout||'—')+'</span>'+
    '<span class="row-price-cell"><strong class="row-price">'+esc(price)+'</strong><small class="row-unit">'+esc(unit)+'</small><span class="row-status '+statusClass+'">'+esc(statusText(x))+'</span></span>'+
  '</button>';
}
function communityRows(c,items){
  const blocks=new Map();
  for(const x of items){const b=x.block||'棟別待確認';if(!blocks.has(b))blocks.set(b,[]);blocks.get(b).push(x)}
  const blockOrder=[...blocks.keys()].sort((a,b)=>(blockRank(a)-blockRank(b))||String(a).localeCompare(String(b),'zh-Hant'));
  return blockOrder.map(b=>'<section class="overview-block"><div class="overview-block-title"><span>'+esc(b)+'</span><small>'+blocks.get(b).length+' 筆</small></div><div class="overview-list">'+sortData(blocks.get(b)).map(compactRow).join('')+'</div></section>').join('');
}
function communityOverview(c,items,open){
  return '<section class="community-overview" data-community="'+esc(c)+'">'+
    '<button type="button" class="community-overview-head" aria-expanded="'+(open?'true':'false')+'">'+
      '<span class="community-overview-name">'+esc(c)+'</span><span class="community-overview-count">'+items.length+' 筆現售</span><span class="community-overview-chevron">'+(open?'−':'＋')+'</span>'+
    '</button>'+
    '<div class="community-overview-body" '+(open?'':'hidden')+'>'+communityRows(c,items)+'</div>'+
  '</section>';
}
function bindOverviewEvents(){
  $$('.community-overview-head').forEach(btn=>btn.onclick=()=>{
    const body=btn.parentElement.querySelector('.community-overview-body');
    const open=btn.getAttribute('aria-expanded')==='true';
    btn.setAttribute('aria-expanded',String(!open));
    btn.querySelector('.community-overview-chevron').textContent=open?'＋':'−';
    if(body)body.hidden=open;
  });
  $$('.listing-row').forEach(e=>e.onclick=()=>detail(listings.find(x=>x.id===e.dataset.id)));
}
function render(){
  const d=sortData(filtered());
  if($('#resultCount'))$('#resultCount').textContent=d.length+' 筆案件';
  if($('#listingGrid')){
    const selected=$('#buildingFilter')?.value||'all';
    if(selected==='all'){
      ensureAllViewToggle();
      const groups=new Map();
      for(const x of d){const c=communityKey(x.community)||'未分類';if(!groups.has(c))groups.set(c,[]);groups.get(c).push(x)}
      const order=MONITORED.filter(c=>groups.has(c));
      for(const c of groups.keys())if(!order.includes(c))order.push(c);
      if(allViewMode==='overview'){
        $('#listingGrid').innerHTML=order.map(c=>communityOverview(c,groups.get(c),false)).join('')||'<div class="card">沒有符合條件的案件。</div>';
        bindOverviewEvents();
      }else if(allViewMode==='list'){
        $('#listingGrid').innerHTML=order.map(c=>'<section class="community-list-section"><div class="community-list-title"><span>'+esc(c)+'</span><small>'+groups.get(c).length+' 筆現售</small></div><div class="overview-list">'+communityRows(c,groups.get(c))+'</div></section>').join('')||'<div class="card">沒有符合條件的案件。</div>';
        bindOverviewEvents();
      }else{
        $('#listingGrid').innerHTML=order.map(c=>{
          const items=groups.get(c)||[];
          const blocks=new Map();
          for(const x of items){const b=x.block||'棟別待確認';if(!blocks.has(b))blocks.set(b,[]);blocks.get(b).push(x)}
          const blockOrder=[...blocks.keys()].sort((a,b)=>(blockRank(a)-blockRank(b))||String(a).localeCompare(String(b),'zh-Hant'));
          return '<section class="community-group" data-community="'+esc(c)+'"><div class="community-group-title"><div><span>'+esc(c)+'</span><small>｜'+items.length+' 筆現售</small></div><b>⌄</b></div><div class="community-blocks">'+blockOrder.map(b=>'<section class="block-group"><div class="block-group-title"><span>'+esc(b)+'</span><small>'+blocks.get(b).length+' 筆</small></div><div class="listing-grid">'+sortData(blocks.get(b)).map(card).join('')+'</div></section>').join('')+'</div></section>'
        }).join('')||'<div class="card">沒有符合條件的案件。</div>';
        $$('.listing-card').forEach(e=>e.onclick=()=>detail(listings.find(x=>x.id===e.dataset.id)));
      }
    }else{
      const bar=$('#allViewToggle');if(bar)bar.remove();
      $('#listingGrid').innerHTML=d.map(card).join('')||'<div class="card">沒有符合條件的案件。</div>';
      $$('.listing-card').forEach(e=>e.onclick=()=>detail(listings.find(x=>x.id===e.dataset.id)));
    }
  }
  if($('#statTotal'))$('#statTotal').textContent=listings.filter(x=>['active','price_drop','price_up'].includes(status(x))).length;
  if($('#statNew'))$('#statNew').textContent=listings.filter(x=>x.new).length;
  if($('#statDrops'))$('#statDrops').textContent=listings.filter(x=>['price_drop','price_up'].includes(status(x))).length;
  if($('#statSold'))$('#statSold').textContent=listings.filter(x=>['sold_pending','gone_pending'].includes(status(x))).length
}function openSoldForm(id){const x=listings.find(v=>v.id===id);if(!x)return;const s=soldState(x);$('#soldTrackingId').value=id;$('#soldKnownPrice').value=s.knownPrice??'';$('#soldDate').value=s.soldDate||'';$('#soldRegStatus').value=s.regStatus||'pending';$('#soldRegPrice').value=s.regPrice??'';$('#soldRegDate').value=s.regDate||'';$('#soldRegAddress').value=s.regAddress||x.address||'';$('#soldNote').value=s.note||'';$('#soldDialog')?.showModal?.()}
function detail(x){if(!x||!$('#detailContent'))return;const active=SOURCES.filter(p=>x.sources?.[p]);$('#detailContent').innerHTML=`<div class="detail"><span class="tag">${statusText(x)}</span><h2>${x.community}｜${x.block||'棟別待確認'} ${x.floor!=null?x.floor+'F':''}</h2><p>同案刊登平台：<b>${active.join('、')||'尚未確認'}</b><br>最後核實：${x.updated||'—'}${x.agent?`<br>仲介：${x.agent}`:''}</p><div class="detail-grid"><div><b>總價</b>${money(x.price)}</div><div><b>單價</b>${x.unit?x.unit+'萬/坪':'待核實'}</div><div><b>總坪</b>${x.area??'—'}坪</div><div><b>建物坪</b>${x.buildingArea??'待核實'}坪</div><div><b>車位坪</b>${x.parkingArea??'—'}坪</div><div><b>車位價格</b>${x.parkingPrice?money(x.parkingPrice):'—'}</div><div><b>格局</b>${x.layout||'—'}</div><div><b>樓層</b>${x.floor!=null?x.floor+'/'+(x.totalFloor||'-')+'F':'待確認'}</div></div><h3>所有原始案件連結</h3><div class="source-links">${linkHtml(x)||'尚未取得有效案件直連'}</div>${healthHtml(x)}${historyHtml(x)}<p class="muted">永慶狀態：${x.yq===true?'已確認有刊登':x.yq===false?'已確認無刊登':'尚未確認'}</p>${x.verificationNote?`<p class="muted">${x.verificationNote}</p>`:''}</div>`;$('#detailDialog')?.showModal?.()}
function changeItem(x,t){return `<div class="change-item"><strong>${t==='new'?'🆕':t==='drop'?'🔻':t==='up'?'🔺':'⚠️'} ${x.community}｜${x.block||''} ${x.floor??''}F</strong><small>${x.area||'—'}坪｜${money(x.price)}｜${t==='new'?'新增':t==='drop'?'價格下降':t==='up'?'價格上升':(x.changeNote||'消失／下架／狀態變更')}</small></div>`}
function renderSoldWait(){const a=listings.filter(x=>{const q=soldState(x);return q.sold&&q.regStatus!=='verified'&&q.regStatus!=='mismatch'});if($('#soldWaitCount'))$('#soldWaitCount').textContent=a.length;if($('#soldWaitSummary'))$('#soldWaitSummary').innerHTML='<b>目前 '+a.length+' 筆待實登</b><div class="muted">實價登錄每月1、11、21日更新；先記錄已知成交價，之後再補上實登結果。</div>';if($('#soldWaitGrid'))$('#soldWaitGrid').innerHTML=a.map(card).join('')||'<div class="card">目前沒有待實登案件。</div>';$$('#soldWaitGrid .listing-card').forEach(e=>e.onclick=()=>detail(listings.find(x=>x.id===e.dataset.id)))}
function renderChanges(){const n=listings.filter(x=>x.new),d=listings.filter(x=>status(x)==='price_drop'),u=listings.filter(x=>status(x)==='price_up'),g=listings.filter(x=>['sold_pending','gone_pending'].includes(status(x)));if($('#changeNewCount'))$('#changeNewCount').textContent=n.length;if($('#changeDropCount'))$('#changeDropCount').textContent=d.length+u.length;if($('#changeGoneCount'))$('#changeGoneCount').textContent=g.length;if($('#newChanges'))$('#newChanges').innerHTML=n.map(x=>changeItem(x,'new')).join('')||'<div class="muted">目前沒有新增。</div>';if($('#dropChanges'))$('#dropChanges').innerHTML=[...d.map(x=>changeItem(x,'drop')),...u.map(x=>changeItem(x,'up'))].join('')||'<div class="muted">本次無價格變動。</div>';if($('#goneChanges'))$('#goneChanges').innerHTML=g.map(x=>changeItem(x,'gone')).join('')||'<div class="muted">目前沒有消失／下架／狀態變更。</div>'}function renderTransactions(){const rows=Array.isArray(transactionData)?transactionData:[];const groups=new Map();for(const c of MONITORED)groups.set(c,[]);for(const x of rows){const c=communityKey(x.community);if(!groups.has(c))groups.set(c,[]);groups.get(c).push(x)}const fmt=v=>v==null?'—':Number(v).toLocaleString('zh-TW');const html=[];for(const c of MONITORED){const items=(groups.get(c)||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));if(!items.length){html.push('<tr class="pending"><td><b>'+esc(c)+'</b></td><td colspan="9">待取得5168直接成交明細</td></tr>');continue}for(const x of items){const pending=x.status!=='verified';html.push('<tr class="'+(pending?'pending':'')+'"><td><b>'+esc(c)+'</b></td><td>'+esc(x.date||'—')+'</td><td>'+esc(x.floor||'—')+'</td><td>'+esc(x.layout||'—')+'</td><td>'+esc(x.buildingArea==null?'—':x.buildingArea+'坪')+(x.parkingArea?' + 車位 '+esc(x.parkingArea)+'坪':'')+'</td><td>'+esc(x.parkingPrice?fmt(x.parkingPrice)+'萬':(x.parking||'—'))+'</td><td><b>'+ (x.totalPrice==null?'—':fmt(x.totalPrice)+'萬')+'</b></td><td>'+ (x.unitPrice==null?'—':fmt(x.unitPrice)+'萬/坪')+'</td><td><a href="'+esc(x.sourceUrl||'https://price.houseprice.tw/')+'" target="_blank" rel="noopener">5168</a></td><td>'+esc(x.note||'待核實')+'</td></tr>')}}if($('#transactionTableBody'))$('#transactionTableBody').innerHTML=html.join('');const verified=rows.filter(x=>x.status==='verified').length;const pendingCommunities=MONITORED.filter(c=>(groups.get(c)||[]).every(x=>x.status!=='verified')).length;if($('#transactionCoverage'))$('#transactionCoverage').textContent='13社區｜已核實成交 '+verified+' 筆｜待核實社區 '+pendingCommunities+'｜資料基準日 2026-09-29'}

$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');$$('.view').forEach(x=>x.classList.remove('active'));$('#view-'+t.dataset.view)?.classList.add('active');if(t.dataset.view==='changes')renderChanges();if(t.dataset.view==='transactions')renderTransactions();if(t.dataset.view==='soldwait')renderSoldWait();if(t.dataset.view==='develop')renderDevelop()});
['#keyword','#buildingFilter','#blockFilter','#priceFilter','#areaFilter','#layoutFilter','#parkingFilter','#sortFilter','#statusFilter'].forEach(s=>$(s)?.addEventListener('input',render));
$('#resetFilters')?.addEventListener('click',()=>{$('#keyword').value='';['#buildingFilter','#blockFilter','#priceFilter','#areaFilter','#layoutFilter','#parkingFilter','#sortFilter'].forEach(s=>$(s).value='all');$('#statusFilter').value='active';render()});
$('#dialogClose')?.addEventListener('click',()=>$('#detailDialog')?.close());$('#statusFilter').value='active';

// ===== SAFE BOOT DIAGNOSTICS =====
window.__TRACKCASE_DIAG__={core:"not-started",coreCount:0,merge:"not-started",dedupe:"not-started",render:"not-started",error:""};
window.addEventListener('error',e=>{window.__TRACKCASE_DIAG__.error=String(e.message||e.error||'JS error');});
loadSoldTracking();
async function getJson(path,fallback){
  try{
    const r=await fetch(path+'?'+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error(path+' HTTP '+r.status);
    return await r.json();
  }catch(e){console.warn('資料讀取失敗：'+path,e);return fallback;}
}
async function init(){
  // 主案件資料是核心來源：先顯示，任何輔助檔案或去重異常都不得讓前台變成 0 筆。
  const a=await getJson('data/listings.json',[]);
  listings=Array.isArray(a)?a:[];
  window.listings=listings;
  window.__TRACKCASE_DIAG__.core='loaded'; window.__TRACKCASE_DIAG__.coreCount=listings.length;
  try{render();window.__TRACKCASE_DIAG__.render='initial-ok';}catch(e){window.__TRACKCASE_DIAG__.render='initial-error';window.__TRACKCASE_DIAG__.error=String(e);}
  try{
    const [m,meta,o,curr,ledger,scan,tx]=await Promise.all([
      getJson('data/manual-updates.json',[]),
      getJson('data/source-status.json',{}),
      getJson('data/verified-overrides.json',{}),
      getJson('data/current-community-update.json',{listings:[]}),
      getJson('data/scan-ledger.json',{}),
      getJson('data/scan-2026-09-07.json',{listings:[]}),
      getJson('data/transactions.json',{transactions:[]})
    ]);
    // 11社區的 canonicalCurrentListings 是本輪已整理完成的正式現售集合；避免掃描結果寫入 current-update 卻未同步前台。\n    const canonicalCurrent=Array.isArray(curr?.canonicalCurrentListings)?curr.canonicalCurrentListings:[];\n    const canonicalCommunities=new Set(canonicalCurrent.map(x=>communityKey(x.community)));\n    const map=new Map(listings.map(x=>[x.id,x]));
    (Array.isArray(m)?m:[]).forEach(x=>map.set(x.id,{...(map.get(x.id)||{}),...x,sources:{...(map.get(x.id)?.sources||{}),...(x.sources||{})},links:{...(map.get(x.id)?.links||{}),...(x.links||{})}}));
    Object.values(o||{}).forEach(group=>Object.entries(group||{}).forEach(([id,x])=>{
      const cur=map.get(id);
      if(cur) map.set(id,{...cur,...x,sources:{...(cur.sources||{}),...(x.sources||{})},links:{...(cur.links||{}),...(x.links||{})}});
      else if(x?.community) map.set(id,{id,...x});
    }));
    // 對有 canonical 集合的11社區，以本輪正式現售集合取代舊主資料；其他社區維持原資料。\n    if(canonicalCurrent.length){ for(const k of canonicalCommunities){ for(const id of [...map.keys()]){ if(communityKey(map.get(id)?.community)===k) map.delete(id); } } for(const x of canonicalCurrent){ map.set(x.id,x); } }\n    const merged=[...map.values()];
    try{ listings=dedupe(merged); window.__TRACKCASE_DIAG__.dedupe='ok'; }catch(e){ console.error('去重失敗，保留原始案件資料',e); listings=merged; window.__TRACKCASE_DIAG__.dedupe='error'; window.__TRACKCASE_DIAG__.error=String(e); }
    window.listings=listings;
    window.__TRACKCASE_DIAG__.merge='ok';
    sourceMeta=meta||{};
    transactionData=Array.isArray(tx?.records)?tx.records:(Array.isArray(tx?.transactions)?tx.transactions:[]);
    scanMeta={...ledger,...scan};
  }catch(e){
    console.error('輔助資料處理失敗，保留主案件資料',e);
  }
  if($('#lastUpdated')){
    const raw=sourceMeta?.lastScheduledCheck||sourceMeta?.lastUpdated;
    let stamp='資料已載入';
    if(raw){const dt=new Date(raw);if(!Number.isNaN(dt.getTime()))stamp=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(dt).replaceAll('/','-');}
    $('#lastUpdated').textContent='最後更新：'+stamp+'｜掃描流程2.0｜'+(sourceMeta?.scanCompleteness?.status==='partial'||scanMeta.coverage_status==='partial'?'🟡部分完成：平台逐案核實仍需補齊':'🟢完整掃描');
  }
  if($('#buildingFilter'))$('#buildingFilter').innerHTML='<option value="all">全部</option>'+MONITORED.map(x=>`<option value="${x}">${x}</option>`).join('');
  const blocks=[...new Set(listings.map(x=>x.block).filter(Boolean))];
  if($('#blockFilter'))$('#blockFilter').innerHTML='<option value="all">全部</option>'+blocks.map(x=>`<option value="${x}">${x}</option>`).join('');
  try{render();window.__TRACKCASE_DIAG__.render='final-ok';}catch(e){window.__TRACKCASE_DIAG__.render='final-error';window.__TRACKCASE_DIAG__.error=String(e);}try{renderChanges();renderSoldWait();}catch(e){console.warn(e)}
}
init();
window.openSoldForm=openSoldForm;
document.addEventListener('DOMContentLoaded',()=>{const f=$('#soldForm');if(f)f.addEventListener('submit',e=>{e.preventDefault();const id=$('#soldTrackingId').value; soldTracking[id]={sold:true,knownPrice:$('#soldKnownPrice').value?Number($('#soldKnownPrice').value):null,soldDate:$('#soldDate').value,regStatus:$('#soldRegStatus').value,regPrice:$('#soldRegPrice').value?Number($('#soldRegPrice').value):null,regDate:$('#soldRegDate').value,regAddress:$('#soldRegAddress').value,note:$('#soldNote').value};saveSoldTracking();$('#soldDialog').close();render();renderChanges();renderSoldWait()});$('#soldCancel')?.addEventListener('click',()=>$('#soldDialog').close());});
