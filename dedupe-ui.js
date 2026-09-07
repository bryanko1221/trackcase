(function(){
  'use strict';
  const ACTIVE=new Set(['active','price_drop','price_up']);
  const SOURCES=['591','信義','樂屋','永慶','中信','住商','台灣房屋','好房網','樂居'];
  const norm=s=>String(s||'').replace(/\s+/g,'').replace(/｜/g,'|');
  const community=v=>norm(v).startsWith('板橋公園世紀')?'板橋公園世紀':norm(v);
  const block=v=>{const s=norm(v);return ['B/C區','B、C區','B、C','BC'].includes(s)?'BC':s};
  const layout=v=>{const m=norm(v).match(/(\d+)房/);return m?m[1]+'房':norm(v)};
  const address=v=>norm(v).replace(/[號樓室]/g,'');
  const urls=x=>Object.values(x?.links||{}).filter(Boolean);
  const ids=x=>Object.values(x?.propertyIds||{}).filter(Boolean).map(String);
  const exactShared=(a,b)=>{
    if(a.groupId&&b.groupId&&String(a.groupId)===String(b.groupId))return {score:100,reason:'相同群組ID'};
    const au=urls(a),bu=urls(b);if(au.some(u=>bu.includes(u)))return {score:100,reason:'相同案件網址'};
    const ai=ids(a),bi=ids(b);if(ai.some(v=>bi.includes(v)))return {score:98,reason:'相同平台案件ID'};
    if(a.address&&b.address&&address(a.address)===address(b.address))return {score:95,reason:'相同地址'};
    return null;
  };
  function confidence(a,b){
    const strong=exactShared(a,b);if(strong)return strong;
    if(community(a.community)!==community(b.community))return {score:0,reason:'不同社區'};
    let s=0,parts=[];
    if(a.floor!=null&&b.floor!=null&&Number(a.floor)===Number(b.floor)){s+=20;parts.push('同樓層')}
    if(a.area!=null&&b.area!=null){const d=Math.abs(Number(a.area)-Number(b.area));if(d<=0.1){s+=20;parts.push('坪數一致')}else if(d<=0.3){s+=15;parts.push('坪數接近')}else if(d<=0.6){s+=8;parts.push('坪數相近')}}
    if(layout(a.layout)&&layout(a.layout)===layout(b.layout)){s+=15;parts.push('格局一致')}
    if(a.parking!=null&&b.parking!=null&&a.parking===b.parking){s+=10;parts.push('車位一致')}
    if(a.block&&b.block&&block(a.block)===block(b.block)){s+=10;parts.push('棟別一致')}
    if(a.price!=null&&b.price!=null){const d=Math.abs(Number(a.price)-Number(b.price)),base=Math.min(Number(a.price),Number(b.price));if(d===0){s+=10;parts.push('價格一致')}else if(d<=Math.max(100,base*0.02)){s+=6;parts.push('價格接近')}}
    return {score:s,reason:parts.join('＋')||'資訊不足'};
  }
  function merge(a,b,conf){
    const newer=String(b.updated||'')>=String(a.updated||'')?b:a, older=newer===a?b:a;
    const out={...older,...newer,sources:{...(a.sources||{}),...(b.sources||{})},links:{...(a.links||{}),...(b.links||{})}};
    out.matchConfidence=Math.max(Number(a.matchConfidence||0),Number(b.matchConfidence||0),conf.score);
    out.matchReason=conf.reason;
    out.sameCasePlatforms=SOURCES.filter(p=>out.sources?.[p]);
    return out;
  }
  function safeDedupe(arr){
    const out=[];
    for(const raw of arr||[]){
      const x={...raw,community:community(raw.community)};
      if(!ACTIVE.has(x.status||'active')){out.push(x);continue;}
      let best=-1,bestConf=null;
      for(let i=0;i<out.length;i++){
        const y=out[i];if(!ACTIVE.has(y.status||'active'))continue;
        const c=confidence(x,y);
        // 90分以上才視為「重複案件」並合併；同條件但沒有強識別證據時，最高只有85分，因此不會誤把不同戶別合在一起。
        if(c.score>=90 && (!bestConf||c.score>bestConf.score)){best=i;bestConf=c;}
      }
      if(best>=0)out[best]=merge(out[best],x,bestConf);else out.push(x);
    }
    return out;
  }
  window.dedupe=safeDedupe;

  function decorate(){
    const grid=document.getElementById('listingGrid');if(!grid||!Array.isArray(window.listings))return;
    grid.querySelectorAll('.listing-card').forEach(card=>{
      const id=card.dataset.id,x=window.listings.find(v=>String(v.id)===String(id));if(!x)return;
      const conf=Number(x.matchConfidence||0);if(conf<90)return;
      if(card.querySelector('.match-badge'))return;
      const host=card.querySelector('.listing-top>div:last-child');if(!host)return;
      const b=document.createElement('span');b.className='match-badge';b.textContent='🔗 同案 '+conf+'%';host.prepend(b);
    });
  }
  function rerender(){if(typeof window.render==='function'){try{window.render();}catch(e){}}setTimeout(decorate,80);setTimeout(decorate,400);setTimeout(decorate,1000);}
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(rerender,50);
    setTimeout(decorate,800);
    const grid=document.getElementById('listingGrid');if(grid)new MutationObserver(()=>setTimeout(decorate,30)).observe(grid,{childList:true,subtree:true});
  });
})();
