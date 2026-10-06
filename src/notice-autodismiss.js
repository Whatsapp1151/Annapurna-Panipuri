const AUTO_DISMISS_MS=4500;
const FADE_MS=220;
const armed=new WeakSet();

function armNotice(el){
  if(!(el instanceof HTMLElement)||!el.classList.contains('notice')||armed.has(el))return;
  armed.add(el);
  setTimeout(()=>{
    if(!el.isConnected)return;
    el.classList.add('ap-notice-leaving');
    setTimeout(()=>{
      if(!el.isConnected)return;
      // Use the notice's existing React click handler to clear its state.
      // No MutationObserver is used here, avoiding re-render/attribute loops on iOS.
      el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
    },FADE_MS);
  },AUTO_DISMISS_MS);
}

function scan(){
  document.querySelectorAll('.notice').forEach(armNotice);
}

// Lightweight polling is intentional: it does not observe or mutate unrelated UI,
// so opening modals, tabs and buttons cannot get trapped in a mutation loop.
scan();
setInterval(scan,500);
