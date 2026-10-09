import {supabase,configured} from './supabase';

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money=n=>'£'+Number(n||0).toFixed(2);
let menuItems=[];
let menuFetchAt=0;
let menuBusy=false;
let lastNotice='';

function addStyles(){
  if(document.getElementById('ap-customer-ux-fixes-css'))return;
  const style=document.createElement('style');
  style.id='ap-customer-ux-fixes-css';
  style.textContent=`
    .ap-soldout-wrap{display:none!important}
    .menuRow.ap-inline-soldout{position:relative;background:inherit!important;opacity:1!important}
    .menuRow.ap-inline-soldout>div:first-child b{color:inherit}
    .ap-inline-soldout .ap-soldout-label{display:inline-flex;align-items:center;margin-top:5px;padding:3px 8px;border-radius:999px;background:#fff1e8;color:#a13916;font-size:11px;font-weight:800;letter-spacing:.02em}
    .ap-inline-soldout .ap-soldout-button{border:1px solid #d26b4c!important;background:#fff5f0!important;color:#a13916!important;font-weight:800!important;cursor:not-allowed!important;opacity:1!important;min-width:86px}
    .ap-email-verify-backdrop{position:fixed;inset:0;z-index:100000;background:rgba(20,28,18,.72);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;backdrop-filter:blur(4px)}
    .ap-email-verify-card{width:min(440px,100%);background:#fffaf0;border-radius:24px;padding:26px 22px;box-shadow:0 24px 70px rgba(0,0,0,.28);text-align:center;color:#203b1b;border:2px solid #e3c57a}
    .ap-email-verify-icon{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;margin:0 auto 14px;background:#fff2c7;font-size:34px}
    .ap-email-verify-card h2{font-size:25px;line-height:1.15;margin:6px 0 10px;color:#244d1c}
    .ap-email-verify-card p{font-size:15px;line-height:1.55;margin:8px 0;color:#4c5748}
    .ap-email-address{display:block;background:#f4f0df;border-radius:12px;padding:10px 12px;margin:13px 0;font-weight:800;word-break:break-word;color:#244d1c}
    .ap-email-important{background:#fff5d9;border:1px solid #ecd089;border-radius:14px;padding:12px;margin:14px 0;text-align:left;font-size:14px;line-height:1.45}
    .ap-email-verify-card button{width:100%;border:0;border-radius:13px;padding:13px 14px;margin-top:9px;font:inherit;font-weight:800;cursor:pointer}
    .ap-email-primary{background:#244d1c;color:white}
    .ap-email-secondary{background:#eee8d7;color:#244d1c}
    .ap-email-resend-status{min-height:20px;font-size:13px!important;font-weight:700;color:#7a5b16!important}
  `;
  document.head.appendChild(style);
}

function captureAuthEmail(event){
  const form=event.target.closest?.('.sheet form');
  if(!form)return;
  const heading=(form.closest('.sheet')?.querySelector('h2')?.textContent||'').trim().toLowerCase();
  const email=String(new FormData(form).get('email')||'').trim().toLowerCase();
  if(!email)return;
  if(heading.includes('create your rewards account'))sessionStorage.setItem('ap-last-signup-email',email);
  if(heading.includes('welcome back'))sessionStorage.setItem('ap-last-login-email',email);
}

document.addEventListener('submit',captureAuthEmail,true);

function verificationModal(kind){
  if(document.querySelector('.ap-email-verify-backdrop'))return;
  const created=kind==='created';
  const email=sessionStorage.getItem(created?'ap-last-signup-email':'ap-last-login-email')||sessionStorage.getItem('ap-last-signup-email')||'';
  const wrap=document.createElement('div');
  wrap.className='ap-email-verify-backdrop';
  wrap.innerHTML=`<div class="ap-email-verify-card" role="dialog" aria-modal="true" aria-labelledby="ap-email-title">
    <div class="ap-email-verify-icon">${created?'✉️':'⚠️'}</div>
    <h2 id="ap-email-title">${created?'Account created successfully':'Email verification required'}</h2>
    <p>${created?'Your Annapurna Panipuri account has been created.':'Your account exists, but you cannot log in until your email address is verified.'}</p>
    ${email?`<span class="ap-email-address">${esc(email)}</span>`:''}
    <div class="ap-email-important"><b>Check your email and tap the verification link.</b><br>If you cannot see it, also check your Spam or Junk folder. After verifying, come back to Annapurna Panipuri and log in.</div>
    <p class="ap-email-resend-status"></p>
    ${email?'<button class="ap-email-secondary ap-email-resend" type="button">Resend verification email</button>':''}
    <button class="ap-email-primary ap-email-close" type="button">${created?'I understand':'Back to login'}</button>
  </div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.ap-email-close')?.addEventListener('click',close);
  wrap.querySelector('.ap-email-resend')?.addEventListener('click',async()=>{
    const btn=wrap.querySelector('.ap-email-resend');
    const status=wrap.querySelector('.ap-email-resend-status');
    btn.disabled=true;btn.textContent='Sending…';status.textContent='';
    try{
      const {error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:location.origin}});
      if(error)throw error;
      status.textContent='✓ Verification email sent again. Please check your inbox.';
    }catch(e){status.textContent=e?.message||'Could not resend the verification email.'}
    finally{btn.disabled=false;btn.textContent='Resend verification email'}
  });
}

function checkNotices(){
  const notices=[...document.querySelectorAll('.notice')];
  const text=notices.map(n=>n.textContent||'').join(' | ').trim();
  if(!text||text===lastNotice)return;
  lastNotice=text;
  if(/account created[\s\S]*confirm your email/i.test(text)){
    verificationModal('created');
    return;
  }
  if(/email not confirmed|email not verified|confirm your email|verify your email/i.test(text))verificationModal('login');
}

async function fetchFullMenu(force=false){
  if(!configured||menuBusy)return;
  if(!force&&Date.now()-menuFetchAt<5000)return;
  menuBusy=true;
  try{
    const {data,error}=await supabase.from('menu_items').select('id,name,category,price,available,listed,vegetarian,sort_order,updated_at').eq('listed',true).order('category').order('sort_order').order('name');
    if(!error&&data){menuItems=data;menuFetchAt=Date.now()}
  }finally{menuBusy=false}
}

function rowName(row){return (row.querySelector('div:first-child b')?.textContent||'').trim().toLowerCase()}
function categoryName(cat){return (cat.querySelector(':scope > h2')?.textContent||'').trim()}

function createSoldOutRow(item){
  const row=document.createElement('div');
  row.className='menuRow orderMenuRow ap-inline-soldout';
  row.dataset.apItemId=item.id;
  row.dataset.apSearch=(item.name+' '+item.category).toLowerCase();
  row.innerHTML=`<div><b>${esc(item.name)}</b><small>${item.vegetarian?'● Vegetarian':''}</small><span class="ap-soldout-label">Sold Out</span></div><strong>${Number(item.price)===0?'FREE':money(item.price)}</strong><button class="addBtn ap-soldout-button" type="button" disabled aria-disabled="true">Sold Out</button>`;
  return row;
}

function ensureCategory(section,name,orderedCategories){
  let categories=[...section.querySelectorAll(':scope > .category')];
  let cat=categories.find(c=>categoryName(c)===name);
  if(cat)return cat;
  cat=document.createElement('div');cat.className='category ap-created-category';cat.innerHTML=`<h2>${esc(name)}</h2>`;
  const wanted=orderedCategories.indexOf(name);
  const next=categories.find(c=>orderedCategories.indexOf(categoryName(c))>wanted);
  if(next)section.insertBefore(cat,next);else section.appendChild(cat);
  return cat;
}

function renderInlineSoldOut(){
  const heading=[...document.querySelectorAll('.pageHead h1')].find(h=>/Choose your favourites/i.test(h.textContent||''));
  if(!heading||!menuItems.length)return;
  const section=heading.closest('section');if(!section)return;
  const q=(section.querySelector('.menuSearch')?.value||'').trim().toLowerCase();
  section.querySelectorAll('.ap-inline-soldout').forEach(r=>r.remove());
  section.querySelectorAll('.ap-created-category').forEach(c=>{if(!c.querySelector('.menuRow'))c.remove()});
  const matching=menuItems.filter(i=>!i.available&&(!q||(i.name+' '+i.category).toLowerCase().includes(q)));
  const orderedCategories=[...new Set(menuItems.map(i=>i.category))];
  for(const item of matching){
    const cat=ensureCategory(section,item.category,orderedCategories);
    cat.appendChild(createSoldOutRow(item));
  }
  // Reorder visible rows inside each category to match database sort order, keeping React rows intact.
  for(const cat of section.querySelectorAll(':scope > .category')){
    const name=categoryName(cat);
    const ordered=menuItems.filter(i=>i.category===name&&(!q||(i.name+' '+i.category).toLowerCase().includes(q)));
    const rows=[...cat.querySelectorAll(':scope > .menuRow')];
    const byName=new Map(rows.map(r=>[rowName(r),r]));
    for(const item of ordered){const row=byName.get(item.name.trim().toLowerCase());if(row)cat.appendChild(row)}
  }
}

let lastSignature='';
async function stockTick(){
  await fetchFullMenu();
  const signature=menuItems.map(i=>`${i.id}:${i.available}:${i.updated_at}`).join('|');
  if(signature!==lastSignature){lastSignature=signature;renderInlineSoldOut()}
  else renderInlineSoldOut();
}

addStyles();
checkNotices();
setInterval(checkNotices,250);
fetchFullMenu(true).then(renderInlineSoldOut);
setInterval(stockTick,1200);
window.addEventListener('focus',()=>fetchFullMenu(true).then(renderInlineSoldOut));
