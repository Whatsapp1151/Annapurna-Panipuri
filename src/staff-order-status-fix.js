import {supabase,configured} from './supabase';

const THRESHOLD=50;
let busy=false;

function toast(message,kind='ok'){
  document.querySelector('.ap-order-toast')?.remove();
  const el=document.createElement('div');
  el.className='ap-order-toast'+(kind==='error'?' error':'');
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

function orderNumber(card){
  return Number(String(card?.querySelector('.orderTop h2')?.textContent||'').replace(/\D/g,''))||null;
}

async function getOrder(card){
  const n=orderNumber(card);
  if(!n)throw new Error('Order could not be identified.');
  const {data,error}=await supabase.from('orders')
    .select('order_id,order_number,status,distance_m,far_order,customer_eta_minutes')
    .eq('order_number',n).maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('Order could not be loaded.');
  return data;
}

function openEtaModal(order){
  document.querySelector('.ap-admin-eta-backdrop')?.remove();
  const customerMinutes=Number(order.customer_eta_minutes)||null;
  const wrap=document.createElement('div');
  wrap.className='ap-admin-eta-backdrop';
  wrap.innerHTML=`<div class="ap-admin-eta-sheet">
    <button class="ap-admin-eta-x" type="button">×</button>
    <div class="ap-admin-eta-kicker">FAR-AWAY COLLECTION ORDER</div>
    <h2>When will order #${order.order_number} be ready?</h2>
    <p>${customerMinutes?`Customer expects to arrive in about <b>${customerMinutes} minutes</b>.`:'Customer confirmed collection.'}</p>
    <form>
      <label>Order will be ready in</label>
      <div class="ap-minutes"><input name="minutes" type="number" inputmode="numeric" min="1" max="240" value="${Math.max(5,customerMinutes||15)}" required/><span>minutes</span></div>
      <small>The customer will be notified with the recommended collection time.</small>
      <button class="ap-admin-eta-accept" type="submit">Accept & notify customer</button>
      <button class="ap-admin-eta-cancel" type="button">Cancel</button>
    </form>
  </div>`;
  document.body.appendChild(wrap);
  const close=()=>{wrap.remove();busy=false};
  wrap.querySelector('.ap-admin-eta-x').addEventListener('click',close);
  wrap.querySelector('.ap-admin-eta-cancel').addEventListener('click',close);
  wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('form').addEventListener('submit',async e=>{
    e.preventDefault();
    const minutes=Number(new FormData(e.currentTarget).get('minutes'));
    if(!Number.isInteger(minutes)||minutes<1||minutes>240)return toast('Enter a ready time between 1 and 240 minutes.','error');
    const btn=wrap.querySelector('.ap-admin-eta-accept');
    btn.disabled=true;btn.textContent='Accepting…';
    const {error}=await supabase.rpc('staff_accept_order_with_eta',{target_order:order.order_id,prep_minutes:minutes});
    if(error){btn.disabled=false;btn.textContent='Accept & notify customer';return toast(error.message||'Could not accept order.','error')}
    const push=await supabase.functions.invoke('order-push',{body:{type:'ORDER_ACCEPTED_ETA',order_id:order.order_id}});
    if(push.error)console.warn(push.error);
    wrap.remove();busy=false;
    toast(`Order #${order.order_number} accepted. Customer notified.`);
    sessionStorage.setItem('ap-return-staff','1');
  });
}

async function updateStatus(order,status){
  const label={ACCEPTED:'Accepted',PREPARING:'Preparing',READY:'Ready to collect',COMPLETED:'Completed'}[status]||status;
  if(!confirm(`Change order #${order.order_number} to ${label}?`)){busy=false;return}
  const {error}=await supabase.rpc('staff_update_order_status',{target_order:order.order_id,new_status_text:status});
  if(error){busy=false;throw error}
  if(status==='READY'){
    const push=await supabase.functions.invoke('order-push',{body:{type:'ORDER_READY',order_id:order.order_id}});
    if(push.error)console.warn(push.error);
  }
  toast(`Order #${order.order_number} → ${label}`);
  sessionStorage.setItem('ap-return-staff','1');
  busy=false;
}

async function handleStatusClick(button,event){
  if(busy)return;
  const card=button.closest('.adminOrder');
  if(!card)return;
  const text=String(button.textContent||'').trim().toLowerCase();
  let status=null;
  if(text==='accept')status='ACCEPTED';
  else if(text==='preparing')status='PREPARING';
  else if(text.includes('ready to collect'))status='READY';
  else if(text==='completed')status='COMPLETED';
  if(!status)return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  busy=true;
  sessionStorage.setItem('ap-return-staff','1');
  try{
    const order=await getOrder(card);
    if(status==='ACCEPTED'&&(order.far_order||Number(order.distance_m)>THRESHOLD)){
      openEtaModal(order);
      return;
    }
    await updateStatus(order,status);
  }catch(e){busy=false;toast(e?.message||'Could not update this order.','error')}
}

// Capture before the older order-flow handler so status updates never trigger a page reload.
document.addEventListener('click',event=>{
  if(!configured)return;
  const button=event.target.closest?.('.adminOrder .statusActions button');
  if(button)handleStatusClick(button,event);
},true);

function restoreStaffAfterUnexpectedReload(){
  if(sessionStorage.getItem('ap-return-staff')!=='1')return;
  const staffButton=document.querySelector('.staffPill');
  const alreadyOpen=[...document.querySelectorAll('.eyebrow')].some(e=>String(e.textContent||'').trim()==='STAFF ONLY');
  if(alreadyOpen){sessionStorage.removeItem('ap-return-staff');return}
  if(staffButton){staffButton.click();setTimeout(()=>sessionStorage.removeItem('ap-return-staff'),600)}
}

const observer=new MutationObserver(()=>restoreStaffAfterUnexpectedReload());
observer.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(restoreStaffAfterUnexpectedReload,100);
