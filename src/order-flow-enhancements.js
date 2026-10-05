import {supabase,configured} from './supabase';

const THRESHOLD=50;
let orderCache=new Map();
let renderTimer=null;

function toast(message){
  document.querySelector('.ap-order-toast')?.remove();
  const el=document.createElement('div');
  el.className='ap-order-toast';
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

function getPosition(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error('Location is not available on this device.'));
    navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  });
}

function orderNumberFromCard(card){
  return Number(String(card?.querySelector('.orderTop h2')?.textContent||'').replace(/\D/g,''))||null;
}

async function getOrderByNumber(orderNumber){
  if(!orderNumber)return null;
  if(orderCache.has(orderNumber))return orderCache.get(orderNumber);
  const {data,error}=await supabase.from('orders')
    .select('order_id,order_number,status,distance_m,far_order,customer_eta_minutes,customer_expected_at,admin_prep_minutes,promised_ready_at,recommended_collection_at,customer_phone,customer_profiles(full_name,mobile_number,email)')
    .eq('order_number',orderNumber).maybeSingle();
  if(error)throw error;
  if(data)orderCache.set(orderNumber,data);
  return data||null;
}

function openFarCollectionModal(distance,pos,onDone){
  document.querySelector('.ap-far-order-backdrop')?.remove();
  const wrap=document.createElement('div');
  wrap.className='ap-far-order-backdrop';
  wrap.innerHTML=`<div class="ap-far-order-sheet">
    <button class="ap-far-x" type="button">×</button>
    <div class="ap-far-icon">📍</div>
    <h2>Collection order</h2>
    <p>You are about <b>${Math.round(distance)} metres</b> from Annapurna Panipuri. You can still order from anywhere, but this order must be collected from the shop.</p>
    <div class="ap-far-warning"><b>Do you agree to collect this order?</b><span>If yes, tell us roughly when you will arrive.</span></div>
    <form>
      <label>I expect to arrive in</label>
      <div class="ap-minutes"><input name="minutes" type="number" inputmode="numeric" min="1" max="240" value="15" required/><span>minutes</span></div>
      <small>Example: enter 15 if you expect to reach the shop in about 15 minutes.</small>
      <button class="ap-far-yes" type="submit">Yes, I’ll collect it</button>
      <button class="ap-far-no" type="button">No, cancel order</button>
    </form>
  </div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.ap-far-x').addEventListener('click',close);
  wrap.querySelector('.ap-far-no').addEventListener('click',close);
  wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('form').addEventListener('submit',async e=>{
    e.preventDefault();
    const minutes=Number(new FormData(e.currentTarget).get('minutes'));
    if(!Number.isInteger(minutes)||minutes<1||minutes>240){toast('Enter a collection time between 1 and 240 minutes.');return}
    const btn=wrap.querySelector('.ap-far-yes');btn.disabled=true;btn.textContent='Saving…';
    const {error}=await supabase.rpc('set_collection_intent',{customer_latitude:pos.coords.latitude,customer_longitude:pos.coords.longitude,eta_minutes:minutes});
    if(error){btn.disabled=false;btn.textContent='Yes, I’ll collect it';toast(error.message);return}
    close();toast(`Collection confirmed. You said you will arrive in about ${minutes} minutes.`);onDone();
  });
}

function openAdminEtaModal(order,onDone){
  document.querySelector('.ap-admin-eta-backdrop')?.remove();
  const customerMinutes=order.customer_eta_minutes||null;
  const wrap=document.createElement('div');wrap.className='ap-admin-eta-backdrop';
  wrap.innerHTML=`<div class="ap-admin-eta-sheet">
    <button class="ap-admin-eta-x" type="button">×</button>
    <div class="ap-admin-eta-kicker">FAR-AWAY COLLECTION ORDER</div>
    <h2>When will order #${order.order_number} be ready?</h2>
    <p>${customerMinutes?`Customer said they expect to arrive in about <b>${customerMinutes} minutes</b>.`:'Customer confirmed they will collect this order.'}</p>
    <form>
      <label>Order will be ready in</label>
      <div class="ap-minutes"><input name="minutes" type="number" inputmode="numeric" min="1" max="240" value="${Math.max(5,customerMinutes||15)}" required/><span>minutes</span></div>
      <small>The customer will be notified with the recommended collection time as soon as you accept.</small>
      <button class="ap-admin-eta-accept" type="submit">Accept & notify customer</button>
      <button class="ap-admin-eta-cancel" type="button">Cancel</button>
    </form>
  </div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.ap-admin-eta-x').addEventListener('click',close);
  wrap.querySelector('.ap-admin-eta-cancel').addEventListener('click',close);
  wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('form').addEventListener('submit',async e=>{
    e.preventDefault();const minutes=Number(new FormData(e.currentTarget).get('minutes'));
    if(!Number.isInteger(minutes)||minutes<1||minutes>240){toast('Enter a ready time between 1 and 240 minutes.');return}
    const btn=wrap.querySelector('.ap-admin-eta-accept');btn.disabled=true;btn.textContent='Accepting…';
    const {error}=await supabase.rpc('staff_accept_order_with_eta',{target_order:order.order_id,prep_minutes:minutes});
    if(error){btn.disabled=false;btn.textContent='Accept & notify customer';toast(error.message);return}
    const push=await supabase.functions.invoke('order-push',{body:{type:'ORDER_ACCEPTED_ETA',order_id:order.order_id}});
    if(push.error)console.warn(push.error);
    close();toast(`Order accepted. Customer notified: ready in about ${minutes} minutes.`);orderCache.clear();onDone();
  });
}

async function interceptCheckout(button,event){
  if(button.dataset.apBypass==='1'){delete button.dataset.apBypass;return}
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  button.disabled=true;
  try{
    const pos=await getPosition();
    const {data,error}=await supabase.rpc('order_distance',{customer_latitude:pos.coords.latitude,customer_longitude:pos.coords.longitude});
    if(error)throw error;
    const distance=Number(data?.distance_m||0);
    if(distance<=THRESHOLD){
      button.dataset.apBypass='1';button.disabled=false;button.click();return;
    }
    button.disabled=false;
    openFarCollectionModal(distance,pos,()=>{button.dataset.apBypass='1';button.click()});
  }catch(e){button.disabled=false;toast(e?.message||'Location is required to confirm collection arrangements.');}
}

async function interceptAccept(button,event){
  if(button.dataset.apBypass==='1'){delete button.dataset.apBypass;return}
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  try{
    const orderNumber=orderNumberFromCard(button.closest('.adminOrder'));
    const order=await getOrderByNumber(orderNumber);
    if(!order)throw new Error('Order could not be loaded.');
    if(!(order.far_order||Number(order.distance_m)>THRESHOLD)){
      button.dataset.apBypass='1';button.click();return;
    }
    openAdminEtaModal(order,()=>setTimeout(()=>location.reload(),500));
  }catch(e){toast(e?.message||'Could not open this order.');}
}

async function interceptReady(button,event){
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  if(button.disabled)return;
  button.disabled=true;
  try{
    const orderNumber=orderNumberFromCard(button.closest('.adminOrder'));
    const order=await getOrderByNumber(orderNumber);
    if(!order)throw new Error('Order could not be loaded.');
    if(!confirm(`Mark order #${order.order_number} as ready to collect?`)){button.disabled=false;return}
    const {error}=await supabase.rpc('staff_update_order_status',{target_order:order.order_id,new_status_text:'READY'});
    if(error)throw error;
    const push=await supabase.functions.invoke('order-push',{body:{type:'ORDER_READY',order_id:order.order_id}});
    if(push.error)console.warn(push.error);
    toast(`Order #${order.order_number} marked ready. Customer notified.`);orderCache.clear();
    setTimeout(()=>location.reload(),500);
  }catch(e){button.disabled=false;toast(e?.message||'Could not mark the order ready.');}
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||!configured)return;
  if(button.matches('.placeOrder')){interceptCheckout(button,event);return}
  const card=button.closest('.adminOrder');if(!card)return;
  const label=button.textContent.trim().toLowerCase();
  if(label==='accept'){interceptAccept(button,event);return}
  if(button.classList.contains('ready')||label.includes('ready to collect')){interceptReady(button,event)}
},true);

function formatTime(value){if(!value)return null;return new Date(value).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}

async function decorateCustomerOrders(){
  const cards=[...document.querySelectorAll('.orderCard')];if(!cards.length)return;
  const nums=cards.map(orderNumberFromCard).filter(Boolean);if(!nums.length)return;
  const {data}=await supabase.from('orders').select('order_number,far_order,customer_eta_minutes,promised_ready_at,recommended_collection_at').in('order_number',nums);
  const map=new Map((data||[]).map(o=>[Number(o.order_number),o]));
  cards.forEach(card=>{
    if(card.querySelector('.ap-collection-info'))return;
    const o=map.get(orderNumberFromCard(card));if(!o)return;
    if(!o.far_order&&!o.promised_ready_at)return;
    const box=document.createElement('div');box.className='ap-collection-info';
    const time=formatTime(o.recommended_collection_at||o.promised_ready_at);
    box.innerHTML=`<b>🚶 Collection timing</b><span>${o.customer_eta_minutes?`You said you would arrive in about ${o.customer_eta_minutes} minutes.`:'Collection confirmed.'}${time?` Recommended collection: <strong>${time}</strong>.`:''}</span>`;
    const meta=card.querySelector('.orderMeta');(meta||card.querySelector('.orderItems')||card).insertAdjacentElement('afterend',box);
  });
}

async function decorateAdminOrders(){
  const cards=[...document.querySelectorAll('.adminOrder')];if(!cards.length)return;
  const nums=cards.map(orderNumberFromCard).filter(Boolean);if(!nums.length)return;
  const {data}=await supabase.from('orders').select('order_number,far_order,customer_eta_minutes,promised_ready_at,recommended_collection_at,customer_phone,customer_profiles(full_name,mobile_number)').in('order_number',nums);
  const map=new Map((data||[]).map(o=>[Number(o.order_number),o]));
  cards.forEach(card=>{
    const o=map.get(orderNumberFromCard(card));if(!o)return;
    if(!card.querySelector('.ap-admin-contact')){
      const top=card.querySelector('.orderTop>div');
      const phone=o.customer_phone||o.customer_profiles?.mobile_number||'No contact number';
      const row=document.createElement('div');row.className='ap-admin-contact';row.textContent=`📱 ${phone}`;top?.appendChild(row);
    }
    if((o.far_order||Number(o.customer_eta_minutes)>0)&&!card.querySelector('.ap-admin-collection-info')){
      const box=document.createElement('div');box.className='ap-admin-collection-info';
      const time=formatTime(o.recommended_collection_at||o.promised_ready_at);
      box.innerHTML=`<b>🚶 Far-away collection order</b><span>Customer arrival: about ${o.customer_eta_minutes||'?'} min${time?` • recommended collection ${time}`:''}</span>`;
      const meta=card.querySelector('.orderMeta');meta?.insertAdjacentElement('afterend',box);
    }
  });
}

function updateOldCopy(){
  document.querySelectorAll('.rule p,.locationBox p,.accountActions details p').forEach(p=>{
    if(/50m|50 metres|OTP|ordering limit/i.test(p.textContent||'')){
      const parent=p.parentElement;
      if(parent?.closest('.rule'))p.textContent='Order from anywhere. If you are more than 50m away, confirm that you will collect and tell us when you expect to arrive.';
      else if(parent?.closest('.locationBox'))p.textContent='You can order from anywhere. More than 50m away requires collection confirmation and your expected arrival time — no extra OTP.';
      else if(/OTP/i.test(p.textContent||''))p.textContent='We use your verified mobile number for account security and order notifications. Orders can be placed from anywhere and are collected from the shop.';
    }
  });
}

function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{updateOldCopy();decorateCustomerOrders();decorateAdminOrders()},120)}
const observer=new MutationObserver(scheduleRender);observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',scheduleRender);
scheduleRender();
