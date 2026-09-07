(function(){
  const gridId='listingGrid';
  const norm=s=>String(s||'').replace(/\s+/g,'').replace(/｜/g,'|');
  const fingerprint=card=>{
    const title=card.querySelector('.listing-title')?.textContent||'';
    const sub=card.querySelector('.listing-sub')?.textContent||'';
    const price=card.querySelector('.price')?.textContent||'';
    return norm(title)+'|'+norm(sub)+'|'+norm(price);
  };
  function mergeDuplicates(){
    const grid=document.getElementById(gridId); if(!grid)return;
    const cards=[...grid.querySelectorAll('.listing-card')];
    const seen=new Map();
    for(const card of cards){
      const key=fingerprint(card);
      if(!key)continue;
      const prior=seen.get(key);
      if(!prior){seen.set(key,card);continue;}
      const priorLinks=prior.querySelector('.source-direct');
      const links=card.querySelector('.source-direct');
      if(priorLinks&&links){
        const existing=new Set([...priorLinks.querySelectorAll('a')].map(a=>a.href));
        links.querySelectorAll('a').forEach(a=>{if(!existing.has(a.href))priorLinks.appendChild(a.cloneNode(true));});
      }
      const priorPlatforms=prior.querySelector('.platforms');
      const platforms=card.querySelector('.platforms');
      if(priorPlatforms&&platforms){
        const existing=norm(priorPlatforms.textContent);
        platforms.querySelectorAll('.platform').forEach(p=>{
          const label=norm(p.textContent||'').replace(/[●○]$/,'');
          if(label&&!existing.includes(label))priorPlatforms.appendChild(p.cloneNode(true));
        });
      }
      card.remove();
    }
  }
  let timer=null;
  function schedule(){clearTimeout(timer);timer=setTimeout(mergeDuplicates,80);}
  document.addEventListener('DOMContentLoaded',()=>{
    const grid=document.getElementById(gridId);
    if(!grid)return;
    new MutationObserver(schedule).observe(grid,{childList:true});
    setTimeout(mergeDuplicates,500);
    setTimeout(mergeDuplicates,1500);
    setTimeout(mergeDuplicates,3000);
  });
})();
