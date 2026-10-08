import {supabase,configured} from './supabase';
import './commerce-growth.css';

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money=n=>'£'+Number(n||0).toFixed(2);
const growth={promoCode:'',promoPreview:null,collectionMode:'ASAP',collectionAt:''};
let staff=false,renderingAdmin=false,menuMeta=[];
const offerFromUrl=new URL(location.href).searchParams.get('offer');
if(offerFromUrl)growth.promoCode=offerFromUrl.trim().toUpperCase();

function toast(msg){
  let n=document.querySelector('.ap-growth-toast');
  if(!n){n=document.createElement('div');n.className='ap-growth-toast';document.body.appendChild(n)}
  n.textContent=msg;n.classList.add('show');clearTimeout(n._t);n._t=setTimeout(()=>n.classList.remove('show'),3800);
}
function parseMoney(text){return Number(String(text||'').replace(/[^0-9.-]/g,''))||0}
function niceDate(v){return v?new Date(v).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—'}
function niceDateTime(v){return v?new Date(v).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}

const nativeRpc=supabase.rpc.bind(supabase);
supabase.rpc=(fn,args={},options)=>{
  if(fn==='create_order'&&args?.cart_items){
    let requested=null;
    if(growth.collectionMode==='SCHEDULED'&&growth.collectionAt){
      const d=new Date(growth.collectionAt);if(!Number.isNaN(d.getTime()))requested=d.toISOString();
    }
    const next={
      fulfilment_text:args.fulfilment_text,
      customer_latitude:args.customer_latitude,
      customer_longitude:args.customer_longitude,
      cart_items:args.cart_items,
      order_notes:args.order_notes??null,
      promo_code:growth.promoPreview?.code||null,
      requested_collection_at:requested
    };
    return nativeRpc('create_order_v3',next,options).then(res=>{
      if(!res?.error&&res?.data){growth.promoCode='';growth.promoPreview=null;growth.collectionMode='ASAP';growth.collectionAt=''}
      return res;
    });
  }
  return nativeRpc(fn,args,options);
};

async function loadRole(){
  if(!configured)return;
  const {data:{session}}=await supabase.auth.getSession();if(!session)return;
  const {data}=await supabase.from('user_roles').select('role').eq('auth_user_id',session.user.id).maybeSingle();
  staff=['STAFF','ADMIN'].includes(data?.role);
}

async function applyPromo(panel){
  const input=panel.querySelector('[name=promo]');const code=String(input?.value||'').trim().toUpperCase();
  if(!code){growth.promoCode='';growth.promoPreview=null;panel.querySelector('.ap-promo-result').innerHTML='';return}
  const section=panel.closest('section');const subtotal=parseMoney(section?.querySelector('.checkoutTotal strong')?.textContent);
  const btn=panel.querySelector('.ap-apply-promo');btn.disabled=true;btn.textContent='Checking…';
  const {data,error}=await nativeRpc('preview_promotion',{promo_code:code,cart_subtotal:subtotal});
  btn.disabled=false;btn.textContent='Apply';
  const result=panel.querySelector('.ap-promo-result');
  if(error){growth.promoPreview=null;result.innerHTML=`<span class="bad">${esc(error.message)}</span>`;return}
  growth.promoCode=code;growth.promoPreview=data;
  result.innerHTML=`<b>✓ ${esc(data.title)}</b><span>${esc(data.code)} saves ${money(data.discount_amount)} • New total <strong>${money(data.total)}</strong></span><small>Valid until ${niceDate(data.expires_at)}</small>`;
}

function renderCheckoutEnhancements(){
  const eye=[...document.querySelectorAll('.pageHead .eyebrow')].find(e=>e.textContent?.trim()==='CHECKOUT');
  const section=eye?.closest('section');if(!section||section.querySelector('.ap-growth-checkout'))return;
  const box=section.querySelector('.checkoutBox');if(!box)return;
  const panel=document.createElement('div');panel.className='ap-growth-checkout';
  panel.innerHTML=`<div class="ap-growth-part"><h2>🎟 Offer code</h2><p>Have an Annapurna offer? Apply it before placing your order.</p><div class="ap-promo-line"><input name="promo" autocomplete="off" maxlength="30" placeholder="e.g. ANNAPURNA10" value="${esc(growth.promoCode)}"><button class="ap-apply-promo" type="button">Apply</button></div><div class="ap-promo-result"></div></div>
  <div class="ap-growth-part"><h2>🕒 Collection time</h2><label class="ap-radio"><input type="radio" name="ap-collection" value="ASAP" ${growth.collectionMode==='ASAP'?'checked':''}> As soon as possible</label><label class="ap-radio"><input type="radio" name="ap-collection" value="SCHEDULED" ${growth.collectionMode==='SCHEDULED'?'checked':''}> Schedule collection</label><div class="ap-schedule-wrap" ${growth.collectionMode==='SCHEDULED'?'':'hidden'}><input class="ap-schedule-input" type="datetime-local" value="${esc(growth.collectionAt)}"><small>Schedule takeaway collection up to 7 days ahead, between 10:00 AM and 10:00 PM.</small></div></div>`;
  box.insertAdjacentElement('afterend',panel);
  panel.querySelector('[name=promo]').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase();if(growth.promoPreview&&e.target.value!==growth.promoPreview.code){growth.promoPreview=null;panel.querySelector('.ap-promo-result').innerHTML=''}});
  panel.querySelector('.ap-apply-promo').addEventListener('click',()=>applyPromo(panel));
  panel.querySelectorAll('[name=ap-collection]').forEach(r=>r.addEventListener('change',()=>{
    growth.collectionMode=r.value;panel.querySelector('.ap-schedule-wrap').hidden=r.value!=='SCHEDULED';
    if(r.value==='SCHEDULED'){
      const take=[...section.querySelectorAll('.choice')].find(l=>/Takeaway/i.test(l.textContent||''));take?.querySelector('input')?.click();
    }
  }));
  panel.querySelector('.ap-schedule-input').addEventListener('change',e=>growth.collectionAt=e.target.value);
  if(growth.promoCode&&!growth.promoPreview)setTimeout(()=>applyPromo(panel),100);
}

function renderOfferBanner(){
  if(!offerFromUrl||document.querySelector('.ap-offer-arrival'))return;
  const main=document.querySelector('main');if(!main)return;
  const b=document.createElement('div');b.className='ap-offer-arrival';b.innerHTML=`<b>🎁 Your Annapurna offer is ready</b><span>Code <strong>${esc(offerFromUrl.toUpperCase())}</strong> will be ready to apply at checkout.</span>`;main.prepend(b);
}

async function loadMenuMeta(){
  const {data}=await supabase.from('menu_items').select('id,name,allergens,dietary_tags,spicy_level,vegetarian,listed');menuMeta=data||[];
}
function tagHtml(item){
  const tags=[];
  if(item.vegetarian)tags.push('<span>🌱 Vegetarian</span>');
  for(const t of item.dietary_tags||[])tags.push(`<span>✓ ${esc(t)}</span>`);
  if(Number(item.spicy_level)>0)tags.push(`<span>${'🌶️'.repeat(Number(item.spicy_level))} Spicy</span>`);
  if((item.allergens||[]).length)tags.push(`<span class="warn">⚠ Contains: ${esc(item.allergens.join(', '))}</span>`);
  return tags.join('');
}
function decorateMenuDietary(){
  const rows=[...document.querySelectorAll('.menuRow')];if(!rows.length||!menuMeta.length)return;
  rows.forEach(row=>{
    if(row.querySelector('.ap-food-tags'))return;
    const name=row.querySelector('b')?.textContent?.trim();const item=menuMeta.find(x=>x.name===name);if(!item)return;
    const tags=tagHtml(item);if(!tags)return;
    const d=document.createElement('div');d.className='ap-food-tags';d.innerHTML=tags;row.querySelector('div')?.appendChild(d);
  });
  const section=rows[0]?.closest('section');
  if(section&&!section.querySelector('.ap-allergen-note')){const n=document.createElement('div');n.className='ap-allergen-note';n.innerHTML='<b>Allergy information</b><span>Allergen information is guidance. If you have an allergy or intolerance, please speak to staff before ordering so we can advise you about preparation and cross-contact.</span>';section.appendChild(n)}
}

function openDietaryEditor(id){
  const item=menuMeta.find(x=>x.id===id);if(!item)return;
  document.querySelector('.ap-dietary-modal')?.remove();
  const allergens=['Gluten','Milk / Dairy','Peanuts','Tree Nuts','Sesame','Soya','Mustard','Celery'];
  const dietary=['Vegan','Jain','Gluten-free','Dairy-free'];
  const wrap=document.createElement('div');wrap.className='ap-dietary-modal';
  wrap.innerHTML=`<div class="ap-dietary-sheet"><button class="ap-x">×</button><h2>${esc(item.name)}</h2><p>Set dietary labels and allergen information shown to customers.</p><h3>Dietary labels</h3><div class="ap-check-grid">${dietary.map(x=>`<label><input type="checkbox" data-diet="${esc(x)}" ${(item.dietary_tags||[]).includes(x)?'checked':''}>${esc(x)}</label>`).join('')}</div><h3>Contains allergens</h3><div class="ap-check-grid">${allergens.map(x=>`<label><input type="checkbox" data-allergen="${esc(x)}" ${(item.allergens||[]).includes(x)?'checked':''}>${esc(x)}</label>`).join('')}</div><h3>Spice level</h3><select class="ap-spice"><option value="0">Not marked spicy</option><option value="1">🌶️ Mild</option><option value="2">🌶️🌶️ Medium</option><option value="3">🌶️🌶️🌶️ Hot</option></select><button class="primary ap-save-diet" type="button">Save dietary info</button></div>`;
  document.body.appendChild(wrap);wrap.querySelector('.ap-spice').value=String(item.spicy_level||0);
  const close=()=>wrap.remove();wrap.querySelector('.ap-x').onclick=close;wrap.onclick=e=>{if(e.target===wrap)close()};
  wrap.querySelector('.ap-save-diet').onclick=async()=>{
    const allergensV=[...wrap.querySelectorAll('[data-allergen]:checked')].map(x=>x.dataset.allergen);
    const dietaryV=[...wrap.querySelectorAll('[data-diet]:checked')].map(x=>x.dataset.diet);
    const spicy=Number(wrap.querySelector('.ap-spice').value)||0;
    const {error}=await supabase.from('menu_items').update({allergens:allergensV,dietary_tags:dietaryV,spicy_level:spicy,updated_at:new Date().toISOString()}).eq('id',id);
    if(error)return toast(error.message);toast('Dietary and allergen information updated.');close();await loadMenuMeta();
  };
}
function decorateManagerDietary(){
  if(!staff)return;
  document.querySelectorAll('.ap-manager-row[data-item-id]').forEach(row=>{
    if(row.querySelector('.ap-dietary-btn'))return;
    const b=document.createElement('button');b.type='button';b.className='ap-dietary-btn';b.textContent='Dietary';b.onclick=()=>openDietaryEditor(row.dataset.itemId);
    const edit=row.querySelector('.ap-edit-btn');edit?.insertAdjacentElement('afterend',b);
  });
}

async function createPromotion(form,status){
  const fd=new FormData(form);const code=String(fd.get('code')||'').trim().toUpperCase().replace(/\s+/g,'');const title=String(fd.get('title')||'').trim();
  const type=String(fd.get('type'));const value=Number(fd.get('value'));const min=Number(fd.get('min')||0);const expiry=String(fd.get('expiry')||'');const per=Number(fd.get('per')||1);const maxRaw=String(fd.get('max')||'').trim();
  if(!code||!title||!expiry||!Number.isFinite(value)||value<=0)return status('Enter a code, title, discount and expiry date.',true);
  if(type==='PERCENT'&&value>100)return status('Percentage discount cannot be more than 100%.',true);
  const expires=new Date(expiry+'T23:59:59');if(Number.isNaN(expires.getTime())||expires<=new Date())return status('Choose a future expiry date.',true);
  const {data:{session}}=await supabase.auth.getSession();
  const {error}=await supabase.from('promotions').insert({code,title,discount_type:type,discount_value:value,min_spend:min||0,expires_at:expires.toISOString(),per_customer_limit:Math.max(1,per||1),max_uses:maxRaw?Math.max(1,Number(maxRaw)):null,created_by:session?.user?.id||null});
  if(error)return status(error.message,true);form.reset();status(`${code} created.`);await renderAdminGrowth(true);
}

async function sendWinback(customerId,promotionId,button){
  if(!promotionId)return toast('Choose an offer first.');button.disabled=true;button.textContent='Sending…';
  const {data,error}=await supabase.functions.invoke('order-push',{body:{type:'REENGAGEMENT',customer_id:customerId,promotion_id:promotionId}});
  button.disabled=false;button.textContent='Send offer';
  if(error)return toast(error.message||'Could not send notification.');
  toast(data?.sent?`Offer notification sent to ${data.sent} device${data.sent===1?'':'s'}.`:'Customer has no active notification subscription.');
}

async function renderAdminGrowth(force=false){
  if(!staff||renderingAdmin)return;
  const head=[...document.querySelectorAll('.pageHead h1')].find(h=>/Admin Dashboard/i.test(h.textContent||''));const section=head?.closest('section');if(!section)return;
  let box=section.querySelector('.ap-growth-admin');if(box&&!force)return;renderingAdmin=true;
  try{
    const [{data:analytics},{data:promos},{data:inactive}]=await Promise.all([
      nativeRpc('staff_analytics'),supabase.from('promotions').select('*').order('created_at',{ascending:false}),nativeRpc('staff_inactive_customers',{inactive_days:14})
    ]);
    if(!box){box=document.createElement('div');box.className='ap-growth-admin';section.appendChild(box)}
    const activePromos=(promos||[]).filter(p=>p.active&&new Date(p.expires_at)>new Date());
    const a=analytics||{},t=a.today||{},s=a.last7||{};
    box.innerHTML=`<div class="ap-growth-title"><div><span>GROWTH TOOLS</span><h2>Offers, customers & analytics</h2></div><button class="ap-growth-refresh">Refresh</button></div>
    <div class="ap-metric-grid"><article><small>Today sales</small><b>${money(t.sales)}</b><span>${t.orders||0} completed orders</span></article><article><small>Average order</small><b>${money(t.average_order)}</b><span>Today</span></article><article><small>7-day sales</small><b>${money(s.sales)}</b><span>${s.orders||0} orders</span></article><article><small>Returning customers</small><b>${s.returning_customers||0}</b><span>Last 7 days</span></article><article><small>New customers</small><b>${s.new_customers||0}</b><span>Last 7 days</span></article><article><small>Walk-ins</small><b>${s.walkins||0}</b><span>Last 7 days</span></article></div>
    <div class="ap-analytics-lists"><div><h3>Top items • 7 days</h3>${(a.top_items||[]).map(x=>`<p><b>${esc(x.item_name)}</b><span>${x.quantity} sold • ${money(x.sales)}</span></p>`).join('')||'<p>No completed orders yet.</p>'}</div><div><h3>Busiest hours • 7 days</h3>${(a.busy_hours||[]).map(x=>`<p><b>${esc(x.hour_label)}</b><span>${x.order_count} orders</span></p>`).join('')||'<p>No completed orders yet.</p>'}</div></div>
    <div class="ap-growth-columns"><div class="ap-growth-card"><h3>🎟 Create offer code</h3><form class="ap-promo-form"><input name="code" placeholder="Code e.g. ANNAPURNA10" maxlength="30" required><input name="title" placeholder="Offer title" maxlength="100" required><div class="ap-form-pair"><select name="type"><option value="PERCENT">Percentage off</option><option value="FIXED">Fixed £ discount</option></select><input name="value" type="number" min="0.01" step="0.01" placeholder="Discount" required></div><div class="ap-form-pair"><input name="min" type="number" min="0" step="0.01" placeholder="Minimum spend £"><input name="expiry" type="date" required></div><div class="ap-form-pair"><input name="per" type="number" min="1" value="1" placeholder="Uses/customer"><input name="max" type="number" min="1" placeholder="Max uses (optional)"></div><button class="primary" type="submit">Create offer</button><div class="ap-promo-status"></div></form><div class="ap-promo-list">${(promos||[]).map(p=>`<div data-promo-id="${p.promotion_id}"><div><b>${esc(p.code)}</b><small>${esc(p.title)} • ${p.discount_type==='PERCENT'?Number(p.discount_value)+'%':money(p.discount_value)} • expires ${niceDate(p.expires_at)}</small></div><button class="ap-toggle-promo">${p.active?'Active':'Paused'}</button></div>`).join('')||'<p>No offers created yet.</p>'}</div></div>
    <div class="ap-growth-card"><h3>💚 Win back customers</h3><p>Customers below have not completed an app order or recorded a walk-in visit for at least 14 days.</p>${activePromos.length?`<label>Offer to send</label><select class="ap-winback-promo">${activePromos.map(p=>`<option value="${p.promotion_id}">${esc(p.code)} — ${esc(p.title)}</option>`).join('')}</select>`:'<div class="ap-empty-offer">Create an active offer first.</div>'}<div class="ap-inactive-list">${(inactive||[]).map(c=>`<div><div><b>${esc(c.full_name)}</b><small>${c.days_inactive} days inactive • ${c.has_push?'🔔 notifications enabled':'🔕 notifications not enabled'}</small></div><button class="ap-send-winback" data-customer="${c.customer_id}" ${!c.has_push||!activePromos.length?'disabled':''}>Send offer</button></div>`).join('')||'<p>Great — no customers are currently 14+ days inactive.</p>'}</div></div></div>`;
    box.querySelector('.ap-growth-refresh').onclick=()=>renderAdminGrowth(true);
    const form=box.querySelector('.ap-promo-form');const status=(m,bad=false)=>{const e=form.querySelector('.ap-promo-status');e.textContent=m;e.classList.toggle('bad',bad)};form.onsubmit=e=>{e.preventDefault();createPromotion(form,status)};
    box.querySelectorAll('.ap-toggle-promo').forEach(btn=>btn.onclick=async()=>{const id=btn.closest('[data-promo-id]').dataset.promoId;const p=(promos||[]).find(x=>x.promotion_id===id);const {error}=await supabase.from('promotions').update({active:!p.active,updated_at:new Date().toISOString()}).eq('promotion_id',id);if(error)toast(error.message);else renderAdminGrowth(true)});
    box.querySelectorAll('.ap-send-winback').forEach(btn=>btn.onclick=()=>sendWinback(btn.dataset.customer,box.querySelector('.ap-winback-promo')?.value,btn));
  }finally{renderingAdmin=false}
}

async function decorateOrderDetails(){
  const cards=[...document.querySelectorAll('.orderCard,.adminOrder')];if(!cards.length)return;
  const nums=cards.map(c=>Number(String(c.querySelector('.orderTop h2')?.textContent||'').replace(/\D/g,''))).filter(Boolean);if(!nums.length)return;
  const {data}=await supabase.from('orders').select('order_number,promo_code,discount_amount,subtotal,total,scheduled_collection_at').in('order_number',nums);
  const map=new Map((data||[]).map(o=>[Number(o.order_number),o]));
  cards.forEach(card=>{
    if(card.querySelector('.ap-order-growth-detail'))return;const n=Number(String(card.querySelector('.orderTop h2')?.textContent||'').replace(/\D/g,''));const o=map.get(n);if(!o)return;
    if(!o.promo_code&&!o.scheduled_collection_at)return;
    const d=document.createElement('div');d.className='ap-order-growth-detail';d.innerHTML=`${o.promo_code?`<span>🎟 ${esc(o.promo_code)} • saved ${money(o.discount_amount)}</span>`:''}${o.scheduled_collection_at?`<span>🕒 Scheduled: <b>${niceDateTime(o.scheduled_collection_at)}</b></span>`:''}`;
    (card.querySelector('.orderMeta')||card.querySelector('.orderItems'))?.insertAdjacentElement('afterend',d);
  });
}

let timer;
const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(async()=>{renderCheckoutEnhancements();renderOfferBanner();decorateMenuDietary();decorateManagerDietary();decorateOrderDetails();renderAdminGrowth()},120)});
observer.observe(document.documentElement,{childList:true,subtree:true});

(async()=>{
  await loadRole();await loadMenuMeta();
  renderCheckoutEnhancements();renderOfferBanner();decorateMenuDietary();decorateManagerDietary();decorateOrderDetails();renderAdminGrowth();
  supabase.channel('ap-growth-menu-meta').on('postgres_changes',{event:'UPDATE',schema:'public',table:'menu_items'},async()=>{await loadMenuMeta();decorateMenuDietary();decorateManagerDietary()}).subscribe();
})();
