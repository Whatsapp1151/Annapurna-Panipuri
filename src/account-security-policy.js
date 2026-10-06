// Account security policy: password changes are only available through the
// Forgot Password email recovery flow. The recovery modal in main-v2.jsx is
// intentionally left untouched.

function removeAccountPasswordAction(){
  document.querySelectorAll('.accountActions button').forEach(button=>{
    const label=(button.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
    if(label==='change password') button.remove();
  });
}

// Prevent the old Account button from firing even for a moment while React is
// rendering, then remove it from the DOM.
document.addEventListener('click',event=>{
  const button=event.target.closest?.('.accountActions button');
  if(!button) return;
  const label=(button.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
  if(label==='change password'){
    event.preventDefault();
    event.stopImmediatePropagation();
    button.remove();
  }
},true);

let queued=false;
const observer=new MutationObserver(()=>{
  if(queued) return;
  queued=true;
  requestAnimationFrame(()=>{
    queued=false;
    removeAccountPasswordAction();
  });
});

function start(){
  removeAccountPasswordAction();
  observer.observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
