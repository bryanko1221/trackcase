(function(){
  const gridId='listingGrid';
  const norm=s=>String(s||'').replace(/\s+/g,'').replace(/｜/g,'|');
  const activeStatuses=new Set(['active','price_drop','price_up']);
  const park=v=>norm(v).startsWith('板橋公園世紀');
  const block=v=>{const s=norm(v);if(['B/C區','B、C區','B、C','BC'].includes(s))return 'BC';return s};
  const layout=v=>{const m=norm(v).match(/(\d+)房/);return m?m[1]+'房':norm(v)};
  const priceText=card=>{const t=card.querySelector('.price')?.textContent||'';const m=t.replace(/,/g,'').match(/([0-9]+(?:\.[0-9]+)?)/);return m?Number(m[1]):null};
  const readCard=card=>{
    const title=card.querySelector('.listing-title')?.textContent||'';
    const sub=card.querySelector('.listing-sub')?.textContent||'';
    const tm=title.match(/^(.*?)｜([^ ]*)\s*(\d+)F/);
    const sm=sub.match(/([0-9]+(?:\.[0-9]+)?)坪/);
    const lm=sub.match(/(\d+)房/);
    return {community:tm?.[1]||'',block:block(tm?.[2]||''),floor:tm?.[3]?Number(tm[3]):null,area:sm?Number(sm[1]):null,layout:lm?lm[1]+'房':'',parking:/有車位/.test(sub),price:priceText(card)};
  };
  function compatiblePark(a,b){
    if(!park(a.community)||!park(b.community))return false;
    if(a.floor==null||b.floor==null||a.floor!==b.floor)return false;
    if(a.area==null||b.area==null||Math.abs(a.area-b.area)>0.6)return false;
    if(a.layout!==b.layout||a.parking!==b.parking)return false;
    if(a.block&&b.block){
      if(a.block===b.block)return true;
      if(a.block==='BC'&&['B區','C區'].includes(b.block))return true;
      if(b.block==='BC'&&['B區','C區'].includes(a.block))return true;
      return false;
    }
    return false;
  }
  function priceClose(a,b){if(a==null||b==null)return true;const d=Math.abs(a-b);return d<=Math.max(100,Math.min(a,b)*0.05);}
  function activePlatforms(card){return new Set([...card.querySelectorAll('.platforms .platform:not(.off)')].map(p=>norm(p.textContent).replace(/[●○]$/,'')));}
  function mergeDom(prior,card){
    const priorLinks=prior.querySelector('.source-direct'),links=card.querySelector('.source-direct');
    if(priorLinks&&links){const existing=new Set([...priorLinks.querySelectorAll('a')].map(a=>a.href));links.querySelectorAll('a').forEach(a=>{if(!existing.has(a.href))priorLinks.appendChild(a.cloneNode(true));});}
    const priorPlatforms=prior.querySelector('.platforms'),platforms=card.querySelector('.platforms');
    if(priorPlatforms&&platforms){const existing=norm(priorPlatforms.textContent);platforms.querySelectorAll('.platform').forEach(p=>{const label=norm(p.textContent||'').replace(/[●○]$/,'');if(label&&!existing.includes(label))priorPlatforms.appendChild(p.cloneNode(true));});}
  }
  function semanticMergeCards(){
    const grid=document.getElementById(gridId);if(!grid)return;
    const cards=[...grid.querySelectorAll('.listing-card')];
    for(let i=0;i<cards.length;i++){
      const a=cards[i];if(!a.isConnected)continue;const ra=readCard(a);if(!park(ra.community))continue;
      for(let j=i+1;j<cards.length;j++){
        const b=cards[j];if(!b.isConnected)continue;const rb=readCard(b);if(!compatiblePark(ra,rb)||!priceClose(ra.price,rb))continue;
        const shared=[...activePlatforms(a)].some(p=>activePlatforms(b).has(p));
        if(shared)continue;
        mergeDom(a,b);b.remove();
      }
    }
  }
  const oldFingerprint=card=>{const title=card.querySelector('.listing-title')?.textContent||'';const sub=card.querySelector('.listing-sub')?.textContent||'';const price=card.querySelector('.price')?.textContent||'';return norm(title)+'|'+norm(sub)+'|'+norm(price)};
  function mergeExact(){
    const grid=document.getElementById(gridId);if(!grid)return;const cards=[...grid.querySelectorAll('.listing-card')],seen=new Map();
    for(const card of cards){const key=oldFingerprint(card);if(!key)continue;const prior=seen.get(key);if(!prior){seen.set(key,card);continue;}const shared=[...activePlatforms(prior)].some(p=>activePlatforms(card).has(p));if(!shared)continue;mergeDom(prior,card);card.remove();}
    semanticMergeCards();
  }
  // Override the app-level dedupe so Park Century uses a cautious semantic match:
  // same community + floor + area + layout + parking + compatible block + close price.
  const originalDedupe=window.dedupe;
  window.dedupe=function(arr){
    if(typeof originalDedupe==='function'){
      const base=originalDedupe(arr);
      const out=[];
      for(const x of base){
        if(!activeStatuses.has(x.status||'active')||!park(x.community)){out.push(x);continue;}
        let found=-1;
        for(let i=0;i<out.length;i++){
          const y=out[i];
          if(!activeStatuses.has(y.status||'active')||!park(y.community))continue;
          const a={community:x.community,block:block(x.block),floor:x.floor,area:x.area,layout:layout(x.layout),parking:x.parking,price:x.price};
          const b={community:y.community,block:block(y.block),floor:y.floor,area:y.area,layout:layout(y.layout),parking:y.parking,price:y.price};
          if(compatiblePark(a,b)&&priceClose(a.price,b.price)){found=i;break;}
        }
        if(found>=0){const y=out[found];out[found]={...y,...x,sources:{...(y.sources||{}),...(x.sources||{})},links:{...(y.links||{}),...(x.links||{})}};}else out.push(x);
      }
      return out;
    }
    return arr;
  };
  let timer=null;function schedule(){clearTimeout(timer);timer=setTimeout(mergeExact,80);}
  document.addEventListener('DOMContentLoaded',()=>{const grid=document.getElementById(gridId);if(!grid)return;new MutationObserver(schedule).observe(grid,{childList:true});setTimeout(mergeExact,500);setTimeout(mergeExact,1500);setTimeout(mergeExact,3000);});
})();
