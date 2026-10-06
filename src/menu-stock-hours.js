import {supabase,configured} from './supabase';

const OPEN_MINUTES=10*60;
const CLOSE_MINUTES=22*60;
let enhanceTimer=null;
let adminRenderBusy=false;

function esc(value=''){
  return String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function money(value){return '£'+Number(value||0).toFixed(2)}
function londonMinutes(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const h=Number(parts.find(p=>p.type==='hour')?.value||0),m=Number(parts.find(p=>p.type==='minute')?.value||0);
  return h*60+m;
}
function orderingOpen(){const mins=londonMinutes();return mins>=OPEN_MINUTES&&mins<CLOSE_MINUTES}
function toast(message){
  let el=document.getElementById('ap-stock-toast');
  if(!el){el=document.createElement('div');el.id='ap-stock-toast';document.body.appendChild(el)}
  el.textContent=message;el.classList.add('show');
  clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove('show'),4200);
}
function scheduleEnhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhanceAll,120)}

function pageByEyebrow(text){
  const e=[...document.querySelectorAll('main .eyebrow')].find(x=>x.textContent.trim()===text);
  return e?.closest('section')||null;
}

function enhanceHours(){
  const open=orderingOpen();
  for(const page of [pageByEyebrow('ORDER & MENU'),pageByEyebrow('CHECKOUT')].filter(Boolean)){
    let banner=page.querySelector('.ap-shop-hours');
    if(!banner){banner=document.createElement('div');banner.className='ap-shop-hours';const head=page.querySelector('.pageHead');head?.after(banner)}
    banner.className='ap-shop-hours '+(open?'open':'closed');
    banner.innerHTML=open?'<b>🟢 Ordering open now</b><span>Place orders until 10:00 PM.</span>':'<b>🌙 Online ordering is closed</b><span>You can still browse the menu. Orders are accepted daily from 10:00 AM to 10:00 PM.</span>';
  }
  const checkout=pageByEyebrow('CHECKOUT');
  const place=checkout?.querySelector('button.placeOrder');
  if(place){
    if(!open){place.dataset.apClosed='1';place.disabled=true;place.textContent='Ordering closed • 10:00 AM–10:00 PM'}
    else if(place.dataset.apClosed==='1'&&!/Checking location/i.test(place.textContent)){delete place.dataset.apClosed;place.disabled=false;place.textContent='Place Order • Pay at Collection'}
  }
}

async function injectSoldOutItems(){
  const page=pageByEyebrow('ORDER & MENU');
  if(!page||!configured)return;
  const now=Date.now();
  if(Number(page.dataset.apSoldFetch||0)>now-2500)return;
  page.dataset.apSoldFetch=String(now);
  const {data,error}=await supabase.from('menu_items').select('id,name,price,category,vegetarian,available,listed,sort_order').eq('listed',true).order('category').order('sort_order');
  if(error||!page.isConnected)return;
  page.querySelectorAll('.ap-soldout-row,.ap-soldout-category').forEach(el=>el.remove());
  for(const item of (data||[]).filter(x=>!x.available)){
    let category=[...page.querySelectorAll('.category')].find(c=>c.querySelector(':scope > h2')?.textContent.trim()===item.category);
    if(!category){category=document.createElement('div');category.className='category ap-soldout-category';category.innerHTML='<h2>'+esc(item.category)+'</h2>';page.appendChild(category)}
    const row=document.createElement('div');row.className='menuRow orderMenuRow ap-soldout-row';row.dataset.menuItemId=item.id;
    row.innerHTML='<div><b>'+esc(item.name)+'</b><small>'+(item.vegetarian?'● Vegetarian • ':'')+'Currently unavailable</small></div><strong>'+money(item.price)+'</strong><button class="addBtn" disabled>Sold Out</button>';
    category.appendChild(row);
  }
}

function cleanupAdminManager(){
  const portal=document.getElementById('ap-menu-manager');
  if(portal)portal.remove();
  document.querySelectorAll('.ap-react-menu-hidden').forEach(el=>{el.style.display='';el.classList.remove('ap-react-menu-hidden')});
}

async function renderAdminManager(portal,force=false){
  if(adminRenderBusy||!portal?.isConnected||!configured)return;
  if(!force&&portal.dataset.ready==='1')return;
  adminRenderBusy=true;portal.dataset.ready='0';
  portal.innerHTML='<div class="ap-manager-loading">Loading menu management…</div>';
  const {data,error}=await supabase.from('menu_items').select('*').order('category').order('sort_order');
  adminRenderBusy=false;
  if(!portal.isConnected)return;
  if(error){portal.innerHTML='<div class="ap-manager-error">'+esc(error.message)+'</div>';return}
  const items=(data||[]).filter(x=>x.listed!==false);
  const categories=[...new Set(items.map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  portal.innerHTML=`
    <div class="ap-manager-head"><div><span>MENU CONTROL</span><h2>Menu & Stock</h2><p>Sold-out items reset to In Stock automatically every day at 10:00 AM.</p></div><div class="ap-hours-chip">10 AM–10 PM orders</div></div>
    <form id="ap-add-menu-form" class="ap-add-menu-form">
      <h3>Add menu item</h3>
      <div class="ap-form-grid">
        <label>Item name<input name="name" required maxlength="100" placeholder="e.g. Cheese Dabeli"></label>
        <label>Category<input name="category" list="ap-menu-categories" required maxlength="80" placeholder="e.g. Dabeli"><datalist id="ap-menu-categories">${categories.map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist></label>
        <label>Price (£)<input name="price" type="number" min="0" step="0.01" required placeholder="0.00"></label>
        <label class="ap-wide">Description (optional)<input name="description" maxlength="250" placeholder="Short description"></label>
      </div>
      <button type="submit" class="ap-add-item">＋ Add Item</button>
    </form>
    <div class="ap-menu-summary"><b>${items.length} listed items</b><span>${items.filter(x=>x.available).length} in stock • ${items.filter(x=>!x.available).length} sold out</span></div>
    <div class="ap-managed-list">${items.map(item=>`
      <article class="ap-managed-row ${item.available?'':'soldout'}" data-id="${item.id}">
        <div class="ap-item-copy"><b>${esc(item.name)}</b><small>${esc(item.category)}</small></div>
        <strong>${money(item.price)}</strong>
        <div class="ap-row-actions">
          <button type="button" data-action="price" aria-label="Edit price">£ Edit</button>
          <button type="button" data-action="stock" class="${item.available?'stock-in':'stock-out'}">${item.available?'In Stock':'Sold Out'}</button>
          <button type="button" data-action="remove" class="remove">Remove</button>
        </div>
      </article>`).join('')}</div>`;
  portal.dataset.ready='1';

  portal.querySelector('#ap-add-menu-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);const name=String(fd.get('name')||'').trim(),category=String(fd.get('category')||'').trim(),description=String(fd.get('description')||'').trim(),price=Number(fd.get('price'));
    if(!name||!category||!Number.isFinite(price)||price<0)return toast('Please enter a valid name, category and price.');
    const current=(data||[]).filter(x=>x.category===category);const sort_order=current.length?Math.max(...current.map(x=>Number(x.sort_order)||0))+10:10;
    const {error:addError}=await supabase.from('menu_items').insert({name,category,description:description||null,price,available:true,listed:true,vegetarian:true,sort_order});
    if(addError)return toast(addError.message);
    toast('✅ '+name+' added to the menu.');await renderAdminManager(portal,true);scheduleEnhance();
  });

  portal.querySelectorAll('.ap-managed-row').forEach(row=>{
    const item=(data||[]).find(x=>x.id===row.dataset.id);if(!item)return;
    row.querySelector('[data-action="price"]')?.addEventListener('click',async()=>{
      const v=prompt('New price for '+item.name,Number(item.price).toFixed(2));if(v===null)return;const price=Number(v);if(!Number.isFinite(price)||price<0)return toast('Invalid price.');
      const {error:e}=await supabase.from('menu_items').update({price,updated_at:new Date().toISOString()}).eq('id',item.id);if(e)return toast(e.message);toast('Price updated.');await renderAdminManager(portal,true);scheduleEnhance();
    });
    row.querySelector('[data-action="stock"]')?.addEventListener('click',async()=>{
      const next=!item.available;const {error:e}=await supabase.from('menu_items').update({available:next,updated_at:new Date().toISOString()}).eq('id',item.id);if(e)return toast(e.message);toast(next?'✅ '+item.name+' is In Stock.':'⛔ '+item.name+' marked Sold Out until the next 10:00 AM reset.');await renderAdminManager(portal,true);scheduleEnhance();
    });
    row.querySelector('[data-action="remove"]')?.addEventListener('click',async()=>{
      if(!confirm('Remove '+item.name+' from the customer menu? Previous orders will be kept.'))return;
      const {error:e}=await supabase.from('menu_items').update({listed:false,available:false,updated_at:new Date().toISOString()}).eq('id',item.id);if(e)return toast(e.message);toast('Removed '+item.name+' from the menu.');await renderAdminManager(portal,true);scheduleEnhance();
    });
  });
}

function enhanceAdminManager(){
  const heading=[...document.querySelectorAll('.adminBox h2')].find(h=>h.textContent.trim()==='Menu management');
  if(!heading){cleanupAdminManager();return}
  const reactBox=heading.closest('.adminBox');
  if(!reactBox)return;
  reactBox.classList.add('ap-react-menu-hidden');reactBox.style.display='none';
  let portal=document.getElementById('ap-menu-manager');
  if(!portal){portal=document.createElement('div');portal.id='ap-menu-manager';reactBox.after(portal)}
  renderAdminManager(portal);
}

async function enhanceAll(){
  enhanceHours();
  enhanceAdminManager();
  await injectSoldOutItems();
}

const observer=new MutationObserver(scheduleEnhance);
observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('focus',scheduleEnhance);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleEnhance()});
setInterval(()=>{enhanceHours();if(pageByEyebrow('ORDER & MENU'))injectSoldOutItems()},30000);
scheduleEnhance();
