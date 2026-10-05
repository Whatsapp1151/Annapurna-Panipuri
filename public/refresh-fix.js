(()=>{
  let refreshing=false;

  function showBootMessage(text='Updating Annapurna Panipuri…'){
    const root=document.getElementById('root');
    if(!root)return;
    if(root.children.length===0){
      root.innerHTML=`<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#fffaf0;color:#244d1c;font:700 16px system-ui,-apple-system,sans-serif;text-align:center">${text}</div>`;
    }
  }

  async function safeRefresh(button){
    if(refreshing)return;
    refreshing=true;
    if(button){button.disabled=true;button.classList.add('spinning')}
    try{
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r=>r.update().catch(()=>{})));
      }
    }catch{}

    // Never delete the PWA caches here. Deleting them before navigation can leave
    // an installed iPhone/Android PWA with no fallback shell if the network request
    // is interrupted, which presents as a blank screen.
    const url=new URL(location.href);
    url.searchParams.set('_refresh',Date.now().toString());
    location.replace(url.toString());
  }

  // Capture the refresh tap before React's old handler can clear the caches.
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('.refreshBtn');
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    safeRefresh(button);
  },true);

  // Recovery guard: if the app shell loads but React never mounts, repair the
  // service-worker state once and reload from the network instead of staying blank.
  window.addEventListener('load',()=>{
    setTimeout(async()=>{
      const root=document.getElementById('root');
      if(!root||root.children.length>0)return;
      if(sessionStorage.getItem('annapurna-boot-recovery')==='1'){
        showBootMessage('Unable to load. Please check your internet connection and reopen Annapurna Panipuri.');
        return;
      }
      sessionStorage.setItem('annapurna-boot-recovery','1');
      showBootMessage('Repairing app update…');
      try{
        if('serviceWorker' in navigator){
          const regs=await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r=>r.unregister().catch(()=>{})));
        }
      }catch{}
      const url=new URL(location.origin+'/');
      url.searchParams.set('_recovery',Date.now().toString());
      location.replace(url.toString());
    },4500);

    // A successful mount clears the one-shot recovery marker.
    setTimeout(()=>{
      const root=document.getElementById('root');
      if(root&&root.children.length>0)sessionStorage.removeItem('annapurna-boot-recovery');
    },6500);
  });
})();
