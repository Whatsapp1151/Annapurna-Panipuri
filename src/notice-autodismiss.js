const AUTO_DISMISS_MS=4500;
const FADE_MS=260;
const timers=new WeakMap();

function armNotice(el){
  if(!(el instanceof HTMLElement)||!el.classList.contains('notice'))return;
  const old=timers.get(el);if(old)clearTimeout(old);
  el.classList.remove('ap-notice-leaving');
  const t=setTimeout(()=>{
    if(!el.isConnected)return;
    el.classList.add('ap-notice-leaving');
    setTimeout(()=>{
      if(!el.isConnected)return;
      // The React notice already clears itself when clicked, so trigger that
      // existing handler instead of mutating React-owned DOM directly.
      el.click();
    },FADE_MS);
  },AUTO_DISMISS_MS);
  timers.set(el,t);
}

function scan(){document.querySelectorAll('.notice').forEach(armNotice)}

const observer=new MutationObserver(mutations=>{
  let shouldScan=false;
  for(const m of mutations){
    if(m.type==='childList'&&m.addedNodes.length)shouldScan=true;
    if(m.type==='characterData'||m.type==='attributes')shouldScan=true;
  }
  if(shouldScan)scan();
});
observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
scan();
