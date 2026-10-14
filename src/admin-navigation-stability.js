let growthVisible=false;
let scheduled=false;

const CORE_LABELS=new Set(['Orders','Loyalty','Menu','Points History']);

function isAdminSection(section){
  return Boolean(section?.querySelector('.pageHead h1')?.textContent?.trim()==='Admin Dashboard');
}

function adminSection(){
  return [...document.querySelectorAll('section')].find(isAdminSection)||null;
}

function coreButton(button){
  if(!button?.closest?.('.adminTabs'))return false;
  const label=(button.textContent||'').replace(/\s+/g,' ').trim();
  return [...CORE_LABELS].some(x=>label===x||label.startsWith(x));
}

function hideGrowth(){
  growthVisible=false;
  document.querySelectorAll('.ap-growth-admin').forEach(x=>{x.style.display='none'});
  const b=document.querySelector('.ap-growth-floating');
  if(b)b.classList.remove('active');
}

function cleanReactManagedAdmin(){
  const section=adminSection();
  if(!section)return;
  section.querySelectorAll(':scope > .ap-growth-admin').forEach(x=>x.remove());
  const tabs=section.querySelector('.adminTabs');
  if(!tabs)return;
  [...tabs.children].forEach(child=>{
    if(child.tagName!=='BUTTON')return;
    const label=(child.textContent||'').replace(/\s+/g,' ').trim();
    const isCore=[...CORE_LABELS].some(x=>label===x||label.startsWith(x));
    if(!isCore)child.remove();
  });
}

function ensureStyle(){
  if(document.getElementById('ap-admin-nav-stability-css'))return;
  const s=document.createElement('style');
  s.id='ap-admin-nav-stability-css';
  s.textContent=`
    .ap-growth-floating{position:fixed;right:14px;bottom:82px;z-index:110000;border:0;border-radius:999px;background:#244d1c;color:#fff;padding:11px 15px;font:700 14px system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);display:none;align-items:center;gap:7px}
    .ap-growth-floating.active{background:#b58a26;color:#1d2d18}
  `;
  document.head.appendChild(s);
}

function ensureGrowthButton(){
  ensureStyle();
  const section=adminSection();
  let button=document.querySelector('.ap-growth-floating');
  if(!section){button?.remove();growthVisible=false;return}
  if(!button){
    button=document.createElement('button');
    button.type='button';
    button.className='ap-growth-floating';
    button.textContent='📈 Growth Tools';
    button.addEventListener('click',()=>{
      growthVisible=!growthVisible;
      button.classList.toggle('active',growthVisible);
      const panel=document.querySelector('.ap-growth-admin');
      if(panel){
        panel.style.display=growthVisible?'grid':'none';
        if(growthVisible)setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}),50);
      }
    });
    document.body.appendChild(button);
  }
  button.style.display='flex';
}

function reconcile(){
  scheduled=false;
  ensureGrowthButton();
  const section=adminSection();
  if(!section)return;
  section.querySelectorAll('.ap-growth-admin').forEach(panel=>{
    if(!growthVisible)panel.style.display='none';
  });
}

function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(reconcile);
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('button');
  if(!coreButton(button))return;
  hideGrowth();
  cleanReactManagedAdmin();
},true);

const observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',schedule);
schedule();
