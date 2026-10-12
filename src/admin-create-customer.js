import {supabase,configured} from './supabase';

let role='CUSTOMER';
let renderQueued=false;

const clean=v=>String(v??'').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function normalisePhone(value){
  let v=clean(value).replace(/[ ()-]/g,'');
  if(v.startsWith('00'))v='+'+v.slice(2);
  if(/^07\d{9}$/.test(v))v='+44'+v.slice(1);
  if(/^44\d{10}$/.test(v))v='+'+v;
  return v;
}
function validPhone(v){return /^\+[1-9]\d{7,14}$/.test(normalisePhone(v))}

function addStyles(){
  if(document.getElementById('ap-create-customer-css'))return;
  const s=document.createElement('style');s.id='ap-create-customer-css';s.textContent=`
    .ap-cc-backdrop{position:fixed;inset:0;z-index:120700;background:rgba(17,26,15,.74);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;backdrop-filter:blur(5px)}
    .ap-cc-sheet{width:min(500px,100%);max-height:92vh;overflow:auto;background:#fffaf0;border:1px solid #e2d5aa;border-radius:22px;padding:22px;box-sizing:border-box;box-shadow:0 24px 70px rgba(0,0,0,.3);font-family:system-ui,-apple-system,sans-serif;color:#203b1b}
    .ap-cc-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.ap-cc-head small{font-weight:900;letter-spacing:.08em;color:#7a6a43}.ap-cc-head h2{margin:5px 0}.ap-cc-head p{margin:0;color:#62675f;line-height:1.45}.ap-cc-x{border:0;background:#eee7d6;width:38px;height:38px;border-radius:50%;font-size:24px;color:#244d1c;cursor:pointer}
    .ap-cc-form{display:grid;gap:10px;margin-top:18px}.ap-cc-form label{font-weight:800}.ap-cc-form input{width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #cfc7ad;border-radius:11px;background:#fff;font:inherit;font-size:16px}.ap-cc-primary{width:100%;padding:13px;border:0;border-radius:11px;background:#244d1c;color:#fff;font:inherit;font-weight:850;cursor:pointer}.ap-cc-primary:disabled{opacity:.55;cursor:not-allowed}.ap-cc-note{background:#fff3cf;border:1px solid #ead08a;border-radius:11px;padding:11px;font-size:13px;line-height:1.45;color:#5e512d}.ap-cc-status{min-height:22px;margin:12px 0 0;font-weight:750;color:#7a5a00}.ap-cc-success{background:#ecf7e8;border:1px solid #9bc58e;border-radius:12px;padding:13px;line-height:1.5;margin-top:18px}
  `;document.head.appendChild(s);
}

async function loadRole(){
  if(!configured)return;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){role='CUSTOMER';renderButton();return}
  const {data}=await supabase.from('user_roles').select('role').eq('auth_user_id',session.user.id).maybeSingle();
  role=data?.role||'CUSTOMER';renderButton();
}

function renderButton(){
  const existing=document.querySelector('[data-create-customer-button]');
  if(role!=='ADMIN'){existing?.remove();return}
  const tabs=document.querySelector('.adminTabs');if(!tabs)return;
  let button=existing;
  if(!button){button=document.createElement('button');button.type='button';button.dataset.createCustomerButton='1';button.innerHTML='<span>➕</span> Create Customer';button.addEventListener('click',openCreate)}
  const customers=tabs.querySelector('[data-customer-log-button]');
  const remove=tabs.querySelector('[data-remove-points-button]');
  if(customers){if(customers.nextElementSibling!==button)customers.insertAdjacentElement('afterend',button)}
  else if(remove){if(remove.nextElementSibling!==button)remove.insertAdjacentElement('afterend',button)}
  else if(button.parentElement!==tabs)tabs.appendChild(button);
}

function openCreate(){
  if(role!=='ADMIN')return;
  addStyles();document.querySelector('.ap-cc-backdrop')?.remove();
  const wrap=document.createElement('div');wrap.className='ap-cc-backdrop';
  wrap.innerHTML=`<div class="ap-cc-sheet" role="dialog" aria-modal="true"><div class="ap-cc-head"><div><small>ADMIN ONLY</small><h2>Create customer account</h2><p>Create a verified customer login without signing out of your admin account.</p></div><button class="ap-cc-x" type="button" aria-label="Close">×</button></div><div class="ap-cc-body"><form class="ap-cc-form"><label>Full name</label><input name="name" autocomplete="off" maxlength="120" placeholder="Customer full name" required/><label>Mobile number</label><input name="mobile" type="tel" inputmode="tel" autocomplete="off" placeholder="07460 399426 or +447460399426" required/><label>Temporary password</label><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="Minimum 8 characters" required/><label>Confirm temporary password</label><input name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required/><div class="ap-cc-note"><b>No OTP is required for an admin-created account.</b> The server creates the Supabase Auth login, confirms the mobile number and prepares the customer loyalty account. Ask the customer to change the temporary password after logging in.</div><button class="ap-cc-primary" type="submit">Create & Activate Customer</button></form></div><div class="ap-cc-status"></div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();wrap.querySelector('.ap-cc-x').onclick=close;wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('form').addEventListener('submit',e=>createCustomer(e,wrap));
}

async function readFunctionError(error){
  let message=String(error?.message||'Could not create customer.');
  try{const payload=await error?.context?.json?.();if(payload?.error)message=String(payload.error)}catch{}
  return message;
}

async function createCustomer(event,wrap){
  event.preventDefault();if(role!=='ADMIN')return;
  const form=event.currentTarget,fd=new FormData(form),name=clean(fd.get('name')),phone=normalisePhone(fd.get('mobile')),password=String(fd.get('password')||''),confirm=String(fd.get('confirm')||'');
  const status=wrap.querySelector('.ap-cc-status');
  if(name.length<2)return status.textContent='Enter the customer’s full name.';
  if(!validPhone(phone))return status.textContent='Enter a valid mobile number.';
  if(password.length<8)return status.textContent='Temporary password must be at least 8 characters.';
  if(password!==confirm)return status.textContent='Passwords do not match.';
  const btn=form.querySelector('button');btn.disabled=true;btn.textContent='Creating account…';status.textContent='';
  try{
    const {data,error}=await supabase.functions.invoke('admin-create-customer',{body:{full_name:name,mobile_number:phone,password}});
    if(error)throw Object.assign(error,{_invokeData:data});
    if(!data?.ok)throw new Error(data?.error||'Customer account was not created.');
    form.reset();
    wrap.querySelector('.ap-cc-body').innerHTML=`<div class="ap-cc-success"><b>✓ Customer account ready</b><br><br><b>${esc(data.full_name||name)}</b><br>${esc(data.mobile_number||phone)}<br><br>The customer can now log in immediately using their mobile number and the temporary password.</div><button class="ap-cc-primary" type="button" style="margin-top:14px">Create Another Customer</button>`;
    wrap.querySelector('.ap-cc-body button').onclick=()=>{wrap.remove();openCreate()};
    status.textContent='Verified mobile, CUSTOMER role and loyalty account are ready.';
  }catch(err){status.textContent=await readFunctionError(err);btn.disabled=false;btn.textContent='Create & Activate Customer'}
}

function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;renderButton()})}
const observer=new MutationObserver(queueRender);observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',loadRole);supabase.auth.onAuthStateChange(()=>setTimeout(loadRole,100));loadRole();
