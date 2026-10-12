import './admin-create-customer.js';
import {supabase,configured} from './supabase';

let role='CUSTOMER';
let renderQueued=false;

const clean=v=>String(v??'').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));

function addStyles(){
  if(document.getElementById('ap-remove-points-css'))return;
  const s=document.createElement('style');
  s.id='ap-remove-points-css';
  s.textContent=`
    .ap-rp-backdrop{position:fixed;inset:0;z-index:120500;background:rgba(20,28,17,.72);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;backdrop-filter:blur(4px)}
    .ap-rp-sheet{width:min(520px,100%);max-height:92vh;overflow:auto;background:#fffaf0;border:1px solid #e2d5aa;border-radius:22px;padding:22px;box-sizing:border-box;box-shadow:0 24px 70px rgba(0,0,0,.28);font-family:system-ui,-apple-system,sans-serif;color:#203b1b}
    .ap-rp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ap-rp-head small{font-weight:900;letter-spacing:.08em;color:#7a6a43}.ap-rp-head h2{margin:5px 0 3px}.ap-rp-head p{margin:0;color:#60665d;line-height:1.45}
    .ap-rp-x{border:0;background:#eee7d6;width:38px;height:38px;border-radius:50%;font-size:24px;color:#244d1c;cursor:pointer}
    .ap-rp-search{display:flex;gap:8px;margin:18px 0}.ap-rp-search input,.ap-rp-form input{flex:1;min-width:0;padding:12px 13px;border:1px solid #cfc7ad;border-radius:11px;background:white;font:inherit;font-size:16px}.ap-rp-search button,.ap-rp-primary{border:0;border-radius:11px;background:#244d1c;color:#fff;font:inherit;font-weight:800;padding:12px 16px;cursor:pointer}.ap-rp-search button:disabled,.ap-rp-primary:disabled{opacity:.55;cursor:not-allowed}
    .ap-rp-results{display:grid;gap:8px}.ap-rp-customer{display:flex;width:100%;justify-content:space-between;align-items:center;gap:12px;text-align:left;border:1px solid #ddd2b1;border-radius:12px;background:#fff;padding:12px;cursor:pointer;color:#203b1b}.ap-rp-customer span{display:grid;gap:2px}.ap-rp-customer small{color:#6b7167}.ap-rp-customer strong{white-space:nowrap}
    .ap-rp-selected{margin-top:16px;border:2px solid #d3bd79;background:#fff7da;border-radius:15px;padding:15px}.ap-rp-selected h3{margin:0 0 4px}.ap-rp-selected p{margin:0 0 12px}.ap-rp-form{display:grid;gap:9px}.ap-rp-form label{font-weight:800}.ap-rp-warning{font-size:13px;line-height:1.45;background:#fff0ec;border:1px solid #e9b3a8;border-radius:10px;padding:10px;color:#7b2f24}.ap-rp-status{min-height:22px;margin:12px 0 0;font-weight:750;color:#7a5a00}.ap-rp-empty{padding:16px;text-align:center;color:#6b7167;background:#f7f2e5;border-radius:12px}
  `;
  document.head.appendChild(s);
}

async function loadRole(){
  if(!configured)return;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){role='CUSTOMER';renderButton();return}
  const {data}=await supabase.from('user_roles').select('role').eq('auth_user_id',session.user.id).maybeSingle();
  role=data?.role||'CUSTOMER';
  renderButton();
}

function renderButton(){
  const existing=document.querySelector('[data-remove-points-button]');
  if(role!=='ADMIN'){existing?.remove();return}
  const tabs=document.querySelector('.adminTabs');
  if(!tabs)return;
  let button=existing;
  if(!button){
    button=document.createElement('button');
    button.type='button';
    button.dataset.removePointsButton='1';
    button.innerHTML='<span>➖</span> Remove Points';
    button.addEventListener('click',openManager);
  }
  const home=tabs.querySelector('[data-home-content-button]');
  if(home){if(home.nextElementSibling!==button)home.insertAdjacentElement('afterend',button)}
  else if(button.parentElement!==tabs)tabs.appendChild(button);
}

function openManager(){
  if(role!=='ADMIN')return;
  addStyles();
  document.querySelector('.ap-rp-backdrop')?.remove();
  const wrap=document.createElement('div');
  wrap.className='ap-rp-backdrop';
  wrap.innerHTML=`<div class="ap-rp-sheet" role="dialog" aria-modal="true">
    <div class="ap-rp-head"><div><small>ADMIN ONLY</small><h2>Remove customer points</h2><p>Use this only to correct points added by mistake. It does not create a redemption entry.</p></div><button class="ap-rp-x" type="button" aria-label="Close">×</button></div>
    <form class="ap-rp-search"><input name="q" placeholder="Search name, mobile or customer ID" autocomplete="off"/><button type="submit">Search</button></form>
    <div class="ap-rp-results"><div class="ap-rp-empty">Search for a customer to continue.</div></div>
    <div class="ap-rp-selected"></div>
    <div class="ap-rp-status"></div>
  </div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.ap-rp-x').onclick=close;
  wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('.ap-rp-search').addEventListener('submit',e=>searchCustomers(e,wrap));
}

async function searchCustomers(event,wrap){
  event.preventDefault();
  const form=event.currentTarget;
  const q=clean(new FormData(form).get('q'));
  const btn=form.querySelector('button');
  const results=wrap.querySelector('.ap-rp-results');
  const selected=wrap.querySelector('.ap-rp-selected');
  const status=wrap.querySelector('.ap-rp-status');
  if(!q){status.textContent='Enter a name, mobile number or customer ID.';return}
  btn.disabled=true;btn.textContent='Searching…';status.textContent='';selected.innerHTML='';
  const {data,error}=await supabase.rpc('staff_search_customers',{search_text:q});
  btn.disabled=false;btn.textContent='Search';
  if(error){results.innerHTML='<div class="ap-rp-empty">Could not search customers.</div>';status.textContent=error.message;return}
  const rows=data||[];
  if(!rows.length){results.innerHTML='<div class="ap-rp-empty">No matching customer found.</div>';return}
  results.innerHTML=rows.map((c,i)=>`<button type="button" class="ap-rp-customer" data-rp-index="${i}"><span><b>${esc(c.full_name||'Customer')}</b><small>${esc(c.mobile_number||'No mobile')} • ${esc(c.customer_id)}</small></span><strong>${Number(c.points_balance||0)} pts</strong></button>`).join('');
  results.querySelectorAll('[data-rp-index]').forEach(b=>b.addEventListener('click',()=>paintSelected(rows[Number(b.dataset.rpIndex)],wrap)));
}

function paintSelected(customer,wrap){
  const selected=wrap.querySelector('.ap-rp-selected');
  const balance=Number(customer.points_balance||0);
  selected.innerHTML=`<h3>${esc(customer.full_name||'Customer')}</h3><p>Current balance: <b>${balance} points</b></p>
    <form class="ap-rp-form">
      <label>Points to remove</label>
      <input name="points" type="number" inputmode="numeric" min="1" max="${Math.max(1,balance)}" step="1" placeholder="e.g. 11" required ${balance<1?'disabled':''}/>
      <div class="ap-rp-warning"><b>Correction only:</b> this reduces the balance directly. It will not show as redeemed and will not increase lifetime redeemed points.</div>
      <button class="ap-rp-primary" type="submit" ${balance<1?'disabled':''}>Remove Points</button>
    </form>`;
  const form=selected.querySelector('form');
  if(form)form.addEventListener('submit',e=>removePoints(e,customer,wrap));
}

async function removePoints(event,customer,wrap){
  event.preventDefault();
  const form=event.currentTarget;
  const points=Number(new FormData(form).get('points'));
  const current=Number(customer.points_balance||0);
  const status=wrap.querySelector('.ap-rp-status');
  if(!Number.isInteger(points)||points<1){status.textContent='Enter a whole number of points to remove.';return}
  if(points>current){status.textContent='You cannot remove more points than the customer currently has.';return}
  if(!confirm(`Remove ${points} point${points===1?'':'s'} from ${customer.full_name||'this customer'}?\n\nThis is an admin correction and will NOT appear as a redemption.`))return;
  const btn=form.querySelector('button');btn.disabled=true;btn.textContent='Removing…';status.textContent='';
  const {data,error}=await supabase.rpc('admin_remove_points',{target_customer:customer.customer_id,points_to_remove:points,idempotency_key:crypto.randomUUID()});
  if(error){btn.disabled=false;btn.textContent='Remove Points';status.textContent=error.message;return}
  customer.points_balance=Number(data?.balance??current-points);
  status.textContent=`✓ ${points} point${points===1?'':'s'} removed. New balance: ${customer.points_balance}. No redemption history was created.`;
  paintSelected(customer,wrap);
  const result=[...wrap.querySelectorAll('.ap-rp-customer')].find(b=>b.textContent.includes(customer.customer_id));
  if(result)result.querySelector('strong').textContent=customer.points_balance+' pts';
}

function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;renderButton()})}
const observer=new MutationObserver(queueRender);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',loadRole);
supabase.auth.onAuthStateChange(()=>setTimeout(loadRole,100));
loadRole();
