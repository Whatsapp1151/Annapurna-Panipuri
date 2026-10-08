import {supabase,configured} from './supabase';

let state={session:null,profile:null,role:'CUSTOMER'};
let renderTimer=null;

const clean=v=>String(v||'').trim();
const profileComplete=p=>Boolean(
  p&&clean(p.full_name)&&clean(p.email)&&clean(p.mobile_number)&&p.mobile_verified_at
);

function toast(message){
  document.querySelector('.ap-profile-toast')?.remove();
  const el=document.createElement('div');el.className='ap-profile-toast';el.textContent=message;document.body.appendChild(el);
  setTimeout(()=>el.remove(),2600);
}

async function loadContext(){
  if(!configured)return;
  const {data:{session}}=await supabase.auth.getSession();state.session=session;
  if(!session){state.profile=null;state.role='CUSTOMER';cleanup();return}
  const [{data:profile},{data:roleRow}]=await Promise.all([
    supabase.from('customer_profiles').select('*').eq('auth_user_id',session.user.id).maybeSingle(),
    supabase.from('user_roles').select('role').eq('auth_user_id',session.user.id).maybeSingle()
  ]);
  state.profile=profile||null;state.role=roleRow?.role||'CUSTOMER';scheduleRender();
}

function cleanup(){
  document.querySelector('.profile-complete-banner')?.remove();
  document.querySelector('.profile-address-card')?.remove();
  document.querySelector('[data-customer-log-button]')?.remove();
  document.querySelector('.ap-profile-backdrop')?.remove();
  document.querySelector('.ap-customer-log-backdrop')?.remove();
}

function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(render,80)}
function render(){
  if(!state.session)return;
  document.querySelector('.profile-address-card')?.remove();
  if(state.role==='CUSTOMER'){
    renderCompletionBanner();
  }else if(['STAFF','ADMIN'].includes(state.role)){
    document.querySelector('.profile-complete-banner')?.remove();
    renderAdminCustomerButton();
  }
}

function renderCompletionBanner(){
  const main=document.querySelector('main');if(!main)return;
  const old=document.querySelector('.profile-complete-banner');
  if(profileComplete(state.profile)){old?.remove();return}
  if(old)return;
  const box=document.createElement('div');box.className='profile-complete-banner';
  box.innerHTML=`<div class="profile-complete-copy"><b>Complete your profile</b><span>Your full name, email and verified mobile number are required before you can place an order.</span></div><button type="button">Complete profile</button>`;
  box.querySelector('button').addEventListener('click',openProfileModal);
  main.insertBefore(box,main.firstChild);
}

function openProfileModal(){
  document.querySelector('.ap-profile-backdrop')?.remove();
  const p=state.profile||{};
  const wrap=document.createElement('div');wrap.className='ap-profile-backdrop';
  wrap.innerHTML=`<div class="ap-profile-sheet">
    <button class="ap-profile-x" type="button" aria-label="Close">×</button>
    <div class="ap-profile-kicker">CUSTOMER PROFILE</div><h2>Complete your details</h2>
    <p>We only need your name, email and verified mobile number for your account and orders.</p>
    <form>
      <label>Full name *</label><input name="full_name" autocomplete="name" value="${attr(p.full_name)}" required maxlength="120"/>
      <label>Email</label><input value="${attr(p.email)}" disabled/>
      <label>Verified mobile</label><input value="${attr(p.mobile_number)}" disabled/>
      <button class="ap-profile-save" type="submit">Save profile</button>
    </form>
  </div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();wrap.querySelector('.ap-profile-x').addEventListener('click',close);wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('form').addEventListener('submit',async e=>{
    e.preventDefault();const btn=wrap.querySelector('.ap-profile-save');const fd=new FormData(e.currentTarget);
    const values={full_name:clean(fd.get('full_name'))};
    if(!values.full_name){toast('Please enter your full name.');return}
    btn.disabled=true;btn.textContent='Saving…';
    const {data,error}=await supabase.from('customer_profiles').update(values).eq('auth_user_id',state.session.user.id).select().single();
    if(error){btn.disabled=false;btn.textContent='Save profile';toast(error.message);return}
    state.profile=data;close();toast('✅ Profile saved.');scheduleRender();setTimeout(()=>location.reload(),650);
  });
}

function renderAdminCustomerButton(){
  const tabs=document.querySelector('.adminTabs');if(!tabs||tabs.querySelector('[data-customer-log-button]'))return;
  const b=document.createElement('button');b.type='button';b.dataset.customerLogButton='1';b.innerHTML='<span style="font-size:16px">👥</span> Customers';b.addEventListener('click',openCustomerLog);tabs.appendChild(b);
}

async function openCustomerLog(){
  document.querySelector('.ap-customer-log-backdrop')?.remove();
  const wrap=document.createElement('div');wrap.className='ap-customer-log-backdrop';
  wrap.innerHTML=`<div class="ap-customer-log"><div class="ap-log-head"><div><small>ADMIN ONLY</small><h2>Registered customers</h2><p>Customer contact details and profile status.</p></div><button class="ap-log-x" type="button">×</button></div><input class="ap-log-search" placeholder="Search name, email, mobile or customer ID…"/><div class="ap-log-count">Loading customers…</div><div class="ap-log-list"><div class="ap-log-loading">Loading…</div></div></div>`;
  document.body.appendChild(wrap);wrap.querySelector('.ap-log-x').addEventListener('click',()=>wrap.remove());wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove()});
  const {data,error}=await supabase.from('customer_profiles').select('customer_id,full_name,email,mobile_number,mobile_verified_at,profile_completed_at,created_at').order('created_at',{ascending:false});
  const list=wrap.querySelector('.ap-log-list'),count=wrap.querySelector('.ap-log-count');
  if(error){list.innerHTML=`<div class="ap-log-loading">${escapeHtml(error.message)}</div>`;count.textContent='Could not load customers';return}
  const rows=data||[];
  const paint=query=>{
    const q=clean(query).toLowerCase();const filtered=rows.filter(c=>!q||[c.full_name,c.email,c.mobile_number,c.customer_id].some(v=>clean(v).toLowerCase().includes(q)));
    count.textContent=`${filtered.length} of ${rows.length} registered customer${rows.length===1?'':'s'}`;
    list.innerHTML=filtered.length?filtered.map(customerCard).join(''):'<div class="ap-log-loading">No matching customers.</div>';
  };
  wrap.querySelector('.ap-log-search').addEventListener('input',e=>paint(e.target.value));paint('');
}

function customerCard(c){
  const complete=Boolean(c.profile_completed_at);
  return `<article class="ap-customer-card"><div class="ap-customer-top"><div><b>${escapeHtml(c.full_name||'Customer')}</b><small>Registered ${new Date(c.created_at).toLocaleDateString('en-GB')}</small></div><span class="${complete?'complete':'incomplete'}">${complete?'Complete':'Incomplete'}</span></div><div class="ap-customer-detail"><strong>📱</strong><span>${escapeHtml(c.mobile_number||'No mobile')} ${c.mobile_verified_at?'✓ verified':'• not verified'}</span></div><div class="ap-customer-detail"><strong>✉️</strong><span>${escapeHtml(c.email||'No email')}</span></div><small class="ap-customer-id">Customer ID: ${escapeHtml(c.customer_id)}</small></article>`;
}

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
function attr(value){return escapeHtml(value).replace(/`/g,'&#96;')}

const observer=new MutationObserver(scheduleRender);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',()=>loadContext());
supabase.auth.onAuthStateChange(()=>setTimeout(loadContext,100));
loadContext();
