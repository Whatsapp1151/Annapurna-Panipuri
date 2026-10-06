import {supabase,configured} from './supabase';

const money=n=>'£'+Number(n||0).toFixed(2);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let shopStatus={is_open:true,opens_at:'10:00',closes_at:'22:00'};
let staffRole=false;
let managerBusy=false;
let reloadScheduled=false;
let lastMenuSignature=null;

async function loadRole(){
  if(!configured)return;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user?.id)return;
  const {data}=await supabase.from('user_roles').select('role').eq('auth_user_id',session.user.id).maybeSingle();
  staffRole=['STAFF','ADMIN'].includes(data?.role);
}

function localNotice(message){
  let n=document.querySelector('.ap-local-notice');
  if(!n){n=document.createElement('div');n.className='notice ap-local-notice';const main=document.querySelector('main');if(main)main.prepend(n)}
  n.textContent=message;
  n.style.display='block';
  clearTimeout(n._timer);
  n._timer=setTimeout(()=>{n.style.display='none'},4500);
}

function currentCustomerTab(){
  if([...document.querySelectorAll('.pageHead h1')].some(h=>/Choose your favourites/i.test(h.textContent||'')))return 'Menu';
  if([...document.querySelectorAll('.pageHead .eyebrow')].some(e=>/CHECKOUT/i.test(e.textContent||'')))return 'Menu';
  const active=document.querySelector('nav button.active span');
  return active?.textContent?.trim()||'Home';
}

function restoreCustomerTab(){
  const target=sessionStorage.getItem('ap-return-tab');
  if(!target)return;
  sessionStorage.removeItem('ap-return-tab');
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    const btn=[...document.querySelectorAll('nav button')].find(b=>b.querySelector('span')?.textContent?.trim()===target);
    if(btn){clearInterval(timer);btn.click()}
    else if(tries>=12)clearInterval(timer);
  },150);
}

function scheduleCustomerMenuRefresh(message='🍽 Menu stock has just changed. Refreshing the latest availability…'){
  if(staffRole||reloadScheduled)return;
  reloadScheduled=true;
  sessionStorage.setItem('ap-return-tab',currentCustomerTab());
  localNotice(message);
  setTimeout(()=>location.reload(),450);
}

async function refreshShopStatus(){
  if(!configured)return;
  const {data,error}=await supabase.rpc('shop_ordering_status');
  if(!error&&data)shopStatus=data;
  renderHoursBanner();
}

function renderHoursBanner(){
  const main=document.querySelector('main');
  if(!main)return;
  let banner=document.querySelector('.ap-shop-hours-banner');
  if(shopStatus?.is_open){banner?.remove();return}
  if(!banner){
    banner=document.createElement('div');
    banner.className='ap-shop-hours-banner';
    main.prepend(banner);
  }
  banner.innerHTML='<b>🕙 Online ordering is closed</b><span>You can browse the menu now. Orders can be placed daily from <strong>10:00 AM to 10:00 PM</strong>.</span>';
}

function blockClosedOrdering(e){
  if(shopStatus?.is_open)return;
  const btn=e.target.closest?.('button');
  if(!btn)return;
  const text=(btn.textContent||'').trim();
  if(/Place Order|Verify OTP & Place Order/i.test(text)){
    e.preventDefault();
    e.stopImmediatePropagation();
    localNotice('🕙 Online ordering is open daily from 10:00 AM to 10:00 PM. You can keep browsing the menu.');
  }
}

document.addEventListener('click',blockClosedOrdering,true);

async function fetchMenu(){
  const {data,error}=await supabase.from('menu_items').select('*').order('category').order('sort_order').order('name');
  if(error)throw error;
  return data||[];
}

function rowHtml(item,removed=false){
  return `<div class="ap-manager-row" data-item-id="${esc(item.id)}">
    <div class="ap-manager-item"><b>${esc(item.name)}</b><small>${esc(item.category)} • ${money(item.price)}</small></div>
    ${removed
      ? '<button class="ap-restore-btn" data-action="restore">Restore</button>'
      : `<button class="ap-stock-btn ${item.available?'in':'out'}" data-action="stock">${item.available?'In Stock':'Sold Out'}</button>
         <button class="ap-edit-btn" data-action="edit">Edit</button>
         <button class="ap-remove-btn" data-action="remove">Remove</button>`}
  </div>`;
}

async function renderManager(box){
  if(managerBusy||!box)return;
  managerBusy=true;
  try{
    const items=await fetchMenu();
    const listed=items.filter(x=>x.listed!==false);
    const removed=items.filter(x=>x.listed===false);
    const categories=[...new Set(items.map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    box.dataset.apMenuManager='1';
    box.innerHTML=`
      <div class="ap-manager-head"><div><h2>Menu management</h2><p>Sold-out items automatically return to In Stock every day at 10:00 AM.</p></div><button class="ap-add-toggle" type="button">+ Add Item</button></div>
      <div class="ap-hours-chip">🕙 Customer ordering hours: <b>10:00 AM–10:00 PM</b></div>
      <form class="ap-add-form" hidden>
        <input name="name" placeholder="Item name" maxlength="100" required>
        <input name="category" list="ap-category-list" placeholder="Category" maxlength="80" required>
        <datalist id="ap-category-list">${categories.map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist>
        <input name="price" type="number" min="0" step="0.01" placeholder="Price (£)" required>
        <textarea name="description" maxlength="300" placeholder="Description (optional)"></textarea>
        <div class="ap-form-actions"><button class="primary" type="submit">Add to Menu</button><button class="secondary ap-add-cancel" type="button">Cancel</button></div>
      </form>
      <div class="ap-manager-status" aria-live="polite"></div>
      <div class="ap-menu-list">${listed.map(i=>rowHtml(i,false)).join('')}</div>
      <details class="ap-removed"><summary>Removed items (${removed.length})</summary><div>${removed.length?removed.map(i=>rowHtml(i,true)).join(''):'<p>No removed items.</p>'}</div></details>`;

    const form=box.querySelector('.ap-add-form');
    box.querySelector('.ap-add-toggle')?.addEventListener('click',()=>{form.hidden=!form.hidden});
    box.querySelector('.ap-add-cancel')?.addEventListener('click',()=>{form.hidden=true;form.reset()});
    form?.addEventListener('submit',async e=>{
      e.preventDefault();
      const fd=new FormData(form),name=String(fd.get('name')||'').trim(),category=String(fd.get('category')||'').trim(),price=Number(fd.get('price')),description=String(fd.get('description')||'').trim();
      if(!name||!category||!Number.isFinite(price)||price<0)return setManagerStatus(box,'Enter a valid item name, category and price.',true);
      const same=items.filter(x=>x.category===category);const sort=(same.reduce((m,x)=>Math.max(m,Number(x.sort_order)||0),0)||0)+10;
      const {error}=await supabase.from('menu_items').insert({name,category,price,description:description||null,available:true,listed:true,vegetarian:true,sort_order:sort});
      if(error)return setManagerStatus(box,error.message,true);
      setManagerStatus(box,`${name} added to the menu.`);await renderManagerFresh(box);
    });

    box.onclick=async e=>{
      const btn=e.target.closest('button[data-action]');if(!btn)return;
      const row=btn.closest('[data-item-id]'),id=row?.dataset.itemId,item=items.find(x=>x.id===id);if(!item)return;
      const action=btn.dataset.action;
      if(action==='stock'){
        const {error}=await supabase.from('menu_items').update({available:!item.available,updated_at:new Date().toISOString()}).eq('id',id);
        if(error)return setManagerStatus(box,error.message,true);
        setManagerStatus(box,`${item.name} marked ${item.available?'Sold Out':'In Stock'}.`);await renderManagerFresh(box);
      }
      if(action==='edit'){
        const nextName=prompt('Item name',item.name);if(nextName===null)return;
        const nextCategory=prompt('Category',item.category);if(nextCategory===null)return;
        const nextPrice=prompt('Price',Number(item.price).toFixed(2));if(nextPrice===null)return;
        const p=Number(nextPrice);if(!nextName.trim()||!nextCategory.trim()||!Number.isFinite(p)||p<0)return setManagerStatus(box,'Invalid item details.',true);
        const {error}=await supabase.from('menu_items').update({name:nextName.trim(),category:nextCategory.trim(),price:p,updated_at:new Date().toISOString()}).eq('id',id);
        if(error)return setManagerStatus(box,error.message,true);
        setManagerStatus(box,'Menu item updated.');await renderManagerFresh(box);
      }
      if(action==='remove'){
        if(!confirm(`Remove ${item.name} from the customer menu?`))return;
        const {error}=await supabase.from('menu_items').update({listed:false,available:false,updated_at:new Date().toISOString()}).eq('id',id);
        if(error)return setManagerStatus(box,error.message,true);
        setManagerStatus(box,`${item.name} removed from the menu.`);await renderManagerFresh(box);
      }
      if(action==='restore'){
        const {error}=await supabase.from('menu_items').update({listed:true,available:true,updated_at:new Date().toISOString()}).eq('id',id);
        if(error)return setManagerStatus(box,error.message,true);
        setManagerStatus(box,`${item.name} restored and marked In Stock.`);await renderManagerFresh(box);
      }
    };
  }catch(e){
    box.innerHTML='<h2>Menu management</h2><p>Could not load menu management.</p>';
  }finally{managerBusy=false}
}

function setManagerStatus(box,text,error=false){
  const el=box.querySelector('.ap-manager-status');if(!el)return;
  el.textContent=text;el.classList.toggle('error',error);el.hidden=false;
  clearTimeout(el._timer);el._timer=setTimeout(()=>{el.hidden=true},4500);
}
async function renderManagerFresh(box){managerBusy=false;await renderManager(box)}

async function maybeEnhanceAdmin(){
  if(!staffRole)return;
  const boxes=[...document.querySelectorAll('.adminBox')];
  const box=boxes.find(b=>b.querySelector('h2')?.textContent?.trim()==='Menu management');
  if(box&&!box.dataset.apMenuManager)await renderManager(box);
}

async function renderSoldOut(){
  const heading=[...document.querySelectorAll('.pageHead h1')].find(h=>/Choose your favourites/i.test(h.textContent||''));
  if(!heading)return;
  const section=heading.closest('section');if(!section)return;
  const {data,error}=await supabase.from('menu_items').select('id,name,category,price,available,listed').eq('listed',true).eq('available',false).order('category').order('sort_order');
  if(error)return;
  section.querySelector('.ap-soldout-wrap')?.remove();
  if(!data?.length)return;
  const wrap=document.createElement('div');wrap.className='ap-soldout-wrap';wrap.innerHTML='<h2>Sold out today</h2><p>These items are unavailable to order and will automatically return to stock at 10:00 AM tomorrow unless staff changes them sooner.</p>'+
    data.map(i=>`<div class="menuRow orderMenuRow ap-soldout-row" data-search="${esc((i.name+' '+i.category).toLowerCase())}"><div><b>${esc(i.name)}</b><small>${esc(i.category)}</small></div><strong>${money(i.price)}</strong><button disabled>Sold Out</button></div>`).join('');
  section.append(wrap);
  const input=section.querySelector('.menuSearch');
  if(input&&!input.dataset.apSoldoutSearch){input.dataset.apSoldoutSearch='1';input.addEventListener('input',()=>filterSoldOut(wrap,input.value))}
  filterSoldOut(wrap,input?.value||'');
}
function filterSoldOut(wrap,value){const q=String(value||'').toLowerCase().trim();wrap.querySelectorAll('.ap-soldout-row').forEach(r=>{r.style.display=!q||r.dataset.search.includes(q)?'':'none'})}

let mutationTimer;
const observer=new MutationObserver(()=>{
  clearTimeout(mutationTimer);
  mutationTimer=setTimeout(()=>{renderHoursBanner();maybeEnhanceAdmin();renderSoldOut()},120);
});
observer.observe(document.documentElement,{subtree:true,childList:true});

async function menuSignature(){
  if(!configured||staffRole)return null;
  const {data,error}=await supabase.from('menu_items').select('id,available,listed,updated_at').order('id');
  if(error)return null;
  return JSON.stringify((data||[]).map(x=>[x.id,x.available,x.listed,x.updated_at]));
}

async function pollMenuChanges(){
  const sig=await menuSignature();
  if(sig===null)return;
  if(lastMenuSignature===null){lastMenuSignature=sig;return}
  if(sig!==lastMenuSignature){lastMenuSignature=sig;scheduleCustomerMenuRefresh()}
}

async function initRealtime(){
  if(!configured)return;
  supabase.channel('annapurna-menu-live-ui-v2').on('postgres_changes',{event:'*',schema:'public',table:'menu_items'},async()=>{
    if(staffRole){await maybeEnhanceAdmin();return}
    scheduleCustomerMenuRefresh('🍽 Menu stock changed. Updating your menu now…');
  }).subscribe();
}

(async()=>{
  await loadRole();
  await refreshShopStatus();
  restoreCustomerTab();
  await maybeEnhanceAdmin();
  await renderSoldOut();
  await initRealtime();
  await pollMenuChanges();
  setInterval(refreshShopStatus,60000);
  setInterval(pollMenuChanges,15000);
})();
