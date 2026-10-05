import {supabase,configured} from './supabase';

const MAX_BANNERS=3;
const MAX_FAVOURITES=6;
let state={session:null,profile:null,role:'CUSTOMER',banners:[],favourites:[],menu:[],orderCount:0};
let renderTimer=null;
let pendingTarget=null;
let orderChannel=null;
let bannerTimer=null;

const clean=v=>String(v??'').trim();
const money=n=>'£'+Number(n||0).toFixed(2);
const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

function toast(message){
  document.querySelector('.ap-merch-toast')?.remove();
  const el=document.createElement('div');
  el.className='ap-merch-toast';el.textContent=message;document.body.appendChild(el);
  setTimeout(()=>el.remove(),3000);
}

async function loadContext(){
  if(!configured)return;
  const {data:{session}}=await supabase.auth.getSession();state.session=session;
  state.profile=null;state.role='CUSTOMER';state.orderCount=0;
  if(session){
    const [{data:p},{data:r}]=await Promise.all([
      supabase.from('customer_profiles').select('customer_id,auth_user_id').eq('auth_user_id',session.user.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('auth_user_id',session.user.id).maybeSingle()
    ]);
    state.profile=p||null;state.role=r?.role||'CUSTOMER';
    await loadOrderCount();
    subscribeOrders();
  }else unsubscribeOrders();
  await loadMerchandising();
  scheduleRender();
}

async function loadOrderCount(){
  if(!state.profile){state.orderCount=0;return}
  const {count}=await supabase.from('orders').select('order_id',{count:'exact',head:true}).eq('customer_id',state.profile.customer_id);
  state.orderCount=count||0;
}

function unsubscribeOrders(){if(orderChannel){supabase.removeChannel(orderChannel);orderChannel=null}}
function subscribeOrders(){
  unsubscribeOrders();if(!state.profile)return;
  orderChannel=supabase.channel('home-order-count-'+state.profile.customer_id)
    .on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:'customer_id=eq.'+state.profile.customer_id},async()=>{await loadOrderCount();scheduleRender()})
    .subscribe();
}

async function loadMerchandising(){
  const staff=['STAFF','ADMIN'].includes(state.role);
  const bannerQuery=supabase.from('home_banners').select('*').order('sort_order').order('created_at');
  const favQuery=supabase.from('home_hot_favourites').select('id,menu_item_id,active,sort_order,menu_items!inner(id,name,price,category,image_url,available)').order('sort_order').order('created_at');
  const menuQuery=supabase.from('menu_items').select('id,name,price,category,image_url,available,sort_order').order('category').order('sort_order');
  const [b,f,m]=await Promise.all([bannerQuery,favQuery,menuQuery]);
  state.banners=(b.data||[]).filter(x=>staff||x.active);
  state.favourites=(f.data||[]).filter(x=>(staff||x.active)&&x.menu_items?.available!==false);
  state.menu=m.data||[];
}

function navButton(label){return [...document.querySelectorAll('nav button')].find(b=>clean(b.querySelector('span')?.textContent).replace(/\s*\(\d+\)$/,'')===label)}
function goHome(){navButton('Home')?.click()}
function goMenu(){navButton('Menu')?.click()}

function goToOrders(){
  if(!state.session){const btn=document.querySelector('[data-ap-orders-nav]');btn?.removeAttribute('data-ap-hijack');return}
  goHome();
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    const btn=[...document.querySelectorAll('.hero .actions button')].find(b=>/my orders/i.test(b.textContent||''));
    if(btn){clearInterval(timer);btn.click()}
    else if(tries>15){clearInterval(timer);toast('Could not open My Orders. Please try again.')}
  },60);
}

function renderNavigation(){
  const nav=document.querySelector('nav');if(!nav)return;
  let orderBtn=nav.querySelector('[data-ap-orders-nav]');
  if(!orderBtn){
    orderBtn=[...nav.querySelectorAll('button')].find(b=>clean(b.querySelector('span')?.textContent)==='History');
    if(orderBtn)orderBtn.dataset.apOrdersNav='1';
  }
  if(orderBtn){
    const span=orderBtn.querySelector('span');
    if(span)span.textContent='My Orders'+(state.orderCount?` (${state.orderCount})`:'');
    orderBtn.classList.toggle('ap-orders-active',Boolean([...document.querySelectorAll('.eyebrow')].find(x=>clean(x.textContent)==='MY ORDERS')));
  }
  const heroOrder=[...document.querySelectorAll('.hero .actions button')].find(b=>/my orders/i.test(b.textContent||''));
  if(heroOrder)heroOrder.classList.add('ap-hide-home-orders');
}

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-ap-orders-nav]');
  if(!btn||!state.session)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();goToOrders();
},true);

function targetItem(id){return state.menu.find(x=>x.id===id)}
function openTarget(type,value){
  if(type==='ITEM'){
    const item=targetItem(value);pendingTarget={type:'ITEM',value:item?.name||value,category:item?.category||''};
  }else if(type==='CATEGORY')pendingTarget={type:'CATEGORY',value};
  else pendingTarget=null;
  goMenu();setTimeout(()=>{renderCategoryStrip();scrollPendingTarget()},180);
}

function renderHomeBanners(){
  const hero=document.querySelector('section.hero');
  if(!hero){document.querySelector('.ap-home-banners')?.remove();return}
  let wrap=document.querySelector('.ap-home-banners');
  const active=state.banners.filter(x=>x.active).slice(0,MAX_BANNERS);
  if(!active.length){wrap?.remove();return}
  const sig=active.map(x=>[x.id,x.title,x.subtitle,x.cta_label,x.target_type,x.target_value].join(':')).join('|');
  if(wrap?.dataset.sig===sig)return;
  wrap?.remove();wrap=document.createElement('section');wrap.className='ap-home-banners';wrap.dataset.sig=sig;
  wrap.innerHTML=`<div class="ap-banner-topline"><span>WHAT'S ON</span><b>Discover something delicious</b></div><div class="ap-banner-track">${active.map((b,i)=>`<article class="ap-banner ap-banner-${i%3}" data-banner-id="${b.id}"><div class="ap-banner-deco" aria-hidden="true"></div><small>ANNAPURNA • FEATURED</small><h2>${esc(b.title)}</h2>${b.subtitle?`<p>${esc(b.subtitle)}</p>`:''}<button type="button" data-banner-cta="${b.id}">${esc(b.cta_label||'Explore menu')} <span>→</span></button></article>`).join('')}</div>${active.length>1?`<div class="ap-banner-dots">${active.map((_,i)=>`<i class="${i===0?'active':''}"></i>`).join('')}</div>`:''}`;
  hero.insertAdjacentElement('afterend',wrap);
  active.forEach(b=>wrap.querySelector(`[data-banner-cta="${b.id}"]`)?.addEventListener('click',()=>openTarget(b.target_type,b.target_value)));
  startBannerRotation(wrap,active.length);
}

function startBannerRotation(wrap,count){
  clearInterval(bannerTimer);bannerTimer=null;if(count<2)return;
  const track=wrap.querySelector('.ap-banner-track'),dots=[...wrap.querySelectorAll('.ap-banner-dots i')];let idx=0;
  const move=()=>{idx=(idx+1)%count;const card=track.children[idx];track.scrollTo({left:card.offsetLeft-track.offsetLeft,behavior:'smooth'});dots.forEach((d,i)=>d.classList.toggle('active',i===idx))};
  bannerTimer=setInterval(move,6500);
  track.addEventListener('scroll',()=>{const cards=[...track.children];let nearest=0,best=Infinity;cards.forEach((c,i)=>{const d=Math.abs(c.getBoundingClientRect().left-track.getBoundingClientRect().left);if(d<best){best=d;nearest=i}});idx=nearest;dots.forEach((d,i)=>d.classList.toggle('active',i===idx))},{passive:true});
}

function renderHotFavourites(){
  const popularSection=[...document.querySelectorAll('section')].find(s=>/popular picks/i.test(s.querySelector('.sectionTitle h2')?.textContent||'')||s.dataset.apHotFavourites==='1');
  if(!popularSection)return;
  popularSection.dataset.apHotFavourites='1';
  const favourites=state.favourites.filter(x=>x.active&&x.menu_items?.available).slice(0,MAX_FAVOURITES);
  const title=popularSection.querySelector('.sectionTitle h2');if(title)title.textContent='Hot Favourites 🔥';
  const see=popularSection.querySelector('.sectionTitle button');if(see)see.textContent='See full menu';
  const old=popularSection.querySelector('.popular');if(!old)return;
  const sig=favourites.map(x=>[x.id,x.menu_items?.name,x.menu_items?.price].join(':')).join('|');
  if(old.dataset.sig===sig)return;old.dataset.sig=sig;old.classList.add('ap-hot-grid');
  if(!favourites.length){old.innerHTML='<div class="ap-hot-empty">Staff favourites will appear here soon.</div>';return}
  old.innerHTML=favourites.map((f,i)=>{const m=f.menu_items;return `<article class="ap-hot-card" data-hot-id="${m.id}"><div class="ap-hot-flame">${i===0?'🔥':'★'}</div><small>${esc(m.category)}</small><b>${esc(m.name)}</b><div class="ap-hot-bottom"><strong>${Number(m.price)===0?'FREE':money(m.price)}</strong><button type="button" aria-label="View ${esc(m.name)}">View →</button></div></article>`}).join('');
  favourites.forEach(f=>old.querySelector(`[data-hot-id="${f.menu_items.id}"] button`)?.addEventListener('click',()=>openTarget('ITEM',f.menu_items.id)));
}

function renderCategoryStrip(){
  const section=[...document.querySelectorAll('section')].find(s=>clean(s.querySelector('.eyebrow')?.textContent)==='ORDER & MENU');
  if(!section){document.querySelector('.ap-category-strip')?.remove();return}
  const cats=[...section.querySelectorAll('.category')];if(!cats.length)return;
  const names=cats.map(c=>clean(c.querySelector('h2')?.textContent)).filter(Boolean);
  const sig=names.join('|');let strip=section.querySelector('.ap-category-strip');
  if(!strip||strip.dataset.sig!==sig){
    strip?.remove();strip=document.createElement('div');strip.className='ap-category-strip';strip.dataset.sig=sig;
    strip.innerHTML=`<div class="ap-category-scroll">${names.map((n,i)=>`<button type="button" data-cat-index="${i}" class="${i===0?'active':''}">${esc(n)}</button>`).join('')}</div>`;
    const search=section.querySelector('.menuSearch');(search||cats[0]).insertAdjacentElement('beforebegin',strip);
    strip.addEventListener('click',e=>{const b=e.target.closest('[data-cat-index]');if(!b)return;const cat=cats[Number(b.dataset.catIndex)];if(cat){const y=cat.getBoundingClientRect().top+scrollY-112;scrollTo({top:y,behavior:'smooth'})}});
  }
  updateActiveCategory();scrollPendingTarget();
}

function updateActiveCategory(){
  const section=[...document.querySelectorAll('section')].find(s=>clean(s.querySelector('.eyebrow')?.textContent)==='ORDER & MENU');if(!section)return;
  const strip=section.querySelector('.ap-category-strip');if(!strip)return;
  const cats=[...section.querySelectorAll('.category')];let active=0;
  cats.forEach((c,i)=>{if(c.getBoundingClientRect().top<=150)active=i});
  const buttons=[...strip.querySelectorAll('button')];buttons.forEach((b,i)=>b.classList.toggle('active',i===active));
  buttons[active]?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
}
window.addEventListener('scroll',()=>requestAnimationFrame(updateActiveCategory),{passive:true});

function scrollPendingTarget(){
  if(!pendingTarget)return;
  const section=[...document.querySelectorAll('section')].find(s=>clean(s.querySelector('.eyebrow')?.textContent)==='ORDER & MENU');if(!section)return;
  let target=null;
  if(pendingTarget.type==='CATEGORY')target=[...section.querySelectorAll('.category')].find(c=>clean(c.querySelector('h2')?.textContent)===clean(pendingTarget.value));
  if(pendingTarget.type==='ITEM')target=[...section.querySelectorAll('.menuRow')].find(r=>clean(r.querySelector('b')?.textContent)===clean(pendingTarget.value));
  if(target){const y=target.getBoundingClientRect().top+scrollY-125;scrollTo({top:y,behavior:'smooth'});pendingTarget=null}
}

function renderAdminButton(){
  const tabs=document.querySelector('.adminTabs');if(!tabs||!['STAFF','ADMIN'].includes(state.role))return;
  if(tabs.querySelector('[data-home-content-button]'))return;
  const b=document.createElement('button');b.type='button';b.dataset.homeContentButton='1';b.innerHTML='<span>✨</span> Home Content';b.addEventListener('click',openContentManager);tabs.appendChild(b);
}

async function openContentManager(){
  await loadMerchandising();document.querySelector('.ap-content-backdrop')?.remove();
  const wrap=document.createElement('div');wrap.className='ap-content-backdrop';
  wrap.innerHTML='<div class="ap-content-sheet"><button class="ap-content-x" type="button">×</button><div class="ap-content-head"><small>STAFF CONTENT MANAGER</small><h2>Home advertising</h2><p>Manage the banners and Hot Favourites shown to customers.</p></div><div class="ap-content-body"></div></div>';
  document.body.appendChild(wrap);wrap.querySelector('.ap-content-x').addEventListener('click',()=>wrap.remove());wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove()});paintContentManager(wrap);
}

function paintContentManager(wrap){
  const body=wrap.querySelector('.ap-content-body');if(!body)return;
  const banners=state.banners.slice().sort((a,b)=>a.sort_order-b.sort_order);
  const favs=state.favourites.slice().sort((a,b)=>a.sort_order-b.sort_order);
  const selectedIds=new Set(favs.map(x=>x.menu_item_id));
  body.innerHTML=`<section class="ap-manager-block"><div class="ap-manager-title"><div><b>Advertising banners</b><span>Up to ${MAX_BANNERS} attractive text banners. Images are disabled for now.</span></div><button type="button" data-add-banner ${banners.length>=MAX_BANNERS?'disabled':''}>+ Add banner</button></div><div class="ap-manager-list">${banners.length?banners.map((b,i)=>`<article class="ap-manager-row"><div><small>${b.active?'LIVE':'HIDDEN'} • ${esc(b.target_type)}</small><b>${esc(b.title)}</b><span>${esc(b.subtitle||'')}</span></div><div class="ap-manager-actions"><button data-banner-up="${b.id}" ${i===0?'disabled':''}>↑</button><button data-banner-down="${b.id}" ${i===banners.length-1?'disabled':''}>↓</button><button data-banner-toggle="${b.id}">${b.active?'Hide':'Show'}</button><button data-banner-edit="${b.id}">Edit</button><button class="danger" data-banner-delete="${b.id}">Delete</button></div></article>`).join(''):'<div class="ap-manager-empty">No banners yet.</div>'}</div></section><section class="ap-manager-block"><div class="ap-manager-title"><div><b>Hot Favourites</b><span>Select up to ${MAX_FAVOURITES} menu items. Their menu image can be used automatically later; for now the cards are image-free.</span></div></div><div class="ap-fav-add"><select data-fav-select><option value="">Choose a menu item…</option>${state.menu.filter(m=>m.available&&!selectedIds.has(m.id)).map(m=>`<option value="${m.id}">${esc(m.name)} — ${esc(m.category)}</option>`).join('')}</select><button type="button" data-add-favourite ${favs.length>=MAX_FAVOURITES?'disabled':''}>Add favourite</button></div><div class="ap-manager-list">${favs.length?favs.map((f,i)=>`<article class="ap-manager-row ap-fav-row"><div><small>${esc(f.menu_items?.category||'')}</small><b>${esc(f.menu_items?.name||'Menu item')}</b><span>${money(f.menu_items?.price)}</span></div><div class="ap-manager-actions"><button data-fav-up="${f.id}" ${i===0?'disabled':''}>↑</button><button data-fav-down="${f.id}" ${i===favs.length-1?'disabled':''}>↓</button><button class="danger" data-fav-delete="${f.id}">Remove</button></div></article>`).join(''):'<div class="ap-manager-empty">No Hot Favourites selected.</div>'}</div></section>`;
  body.querySelector('[data-add-banner]')?.addEventListener('click',()=>openBannerEditor(null,wrap));
  body.querySelector('[data-add-favourite]')?.addEventListener('click',async()=>{const id=body.querySelector('[data-fav-select]')?.value;if(!id)return toast('Choose a menu item first.');if(favs.length>=MAX_FAVOURITES)return toast('You can show up to 6 Hot Favourites.');const {error}=await supabase.from('home_hot_favourites').insert({menu_item_id:id,sort_order:favs.length});if(error)return toast(error.message);await reloadManager(wrap)});
  body.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    const bannerId=b.dataset.bannerEdit||b.dataset.bannerToggle||b.dataset.bannerDelete||b.dataset.bannerUp||b.dataset.bannerDown;
    if(b.dataset.bannerEdit){const row=banners.find(x=>x.id===bannerId);openBannerEditor(row,wrap);return}
    if(b.dataset.bannerToggle){const row=banners.find(x=>x.id===bannerId);await supabase.from('home_banners').update({active:!row.active,updated_at:new Date().toISOString()}).eq('id',bannerId);await reloadManager(wrap);return}
    if(b.dataset.bannerDelete){if(confirm('Delete this home banner?')){await supabase.from('home_banners').delete().eq('id',bannerId);await reloadManager(wrap)}return}
    if(b.dataset.bannerUp||b.dataset.bannerDown){const i=banners.findIndex(x=>x.id===bannerId),j=i+(b.dataset.bannerUp?-1:1);if(j>=0&&j<banners.length){await swapOrder('home_banners',banners[i],banners[j]);await reloadManager(wrap)}return}
    const favId=b.dataset.favDelete||b.dataset.favUp||b.dataset.favDown;
    if(b.dataset.favDelete){await supabase.from('home_hot_favourites').delete().eq('id',favId);await reloadManager(wrap);return}
    if(b.dataset.favUp||b.dataset.favDown){const i=favs.findIndex(x=>x.id===favId),j=i+(b.dataset.favUp?-1:1);if(j>=0&&j<favs.length){await swapOrder('home_hot_favourites',favs[i],favs[j]);await reloadManager(wrap)}}
  });
}

async function swapOrder(table,a,b){await Promise.all([supabase.from(table).update({sort_order:b.sort_order}).eq('id',a.id),supabase.from(table).update({sort_order:a.sort_order}).eq('id',b.id)])}
async function reloadManager(wrap){await loadMerchandising();paintContentManager(wrap);scheduleRender()}

function openBannerEditor(existing,manager){
  document.querySelector('.ap-banner-editor-backdrop')?.remove();
  const edit=document.createElement('div');edit.className='ap-banner-editor-backdrop';
  const categories=[...new Set(state.menu.filter(m=>m.available).map(m=>m.category))];
  edit.innerHTML=`<div class="ap-banner-editor"><button class="ap-editor-x" type="button">×</button><small>${existing?'EDIT BANNER':'NEW BANNER'}</small><h2>${existing?'Update advertising banner':'Create advertising banner'}</h2><form><label>Headline *</label><input name="title" maxlength="80" required value="${esc(existing?.title||'')}"><label>Supporting text</label><textarea name="subtitle" maxlength="180" rows="3">${esc(existing?.subtitle||'')}</textarea><label>Button text *</label><input name="cta" maxlength="35" required value="${esc(existing?.cta_label||'Explore menu')}"><label>When customer taps the button</label><select name="type"><option value="MENU" ${existing?.target_type==='MENU'?'selected':''}>Open full menu</option><option value="CATEGORY" ${existing?.target_type==='CATEGORY'?'selected':''}>Open a category</option><option value="ITEM" ${existing?.target_type==='ITEM'?'selected':''}>Open a menu item</option></select><div data-target-field></div><label class="ap-check"><input type="checkbox" name="active" ${existing?.active!==false?'checked':''}> Show this banner to customers</label><button class="ap-editor-save" type="submit">${existing?'Save changes':'Create banner'}</button></form></div>`;
  document.body.appendChild(edit);const close=()=>edit.remove();edit.querySelector('.ap-editor-x').addEventListener('click',close);edit.addEventListener('click',e=>{if(e.target===edit)close()});
  const type=edit.querySelector('[name="type"]'),field=edit.querySelector('[data-target-field]');
  const paintTarget=()=>{if(type.value==='CATEGORY')field.innerHTML=`<label>Category</label><select name="value">${categories.map(c=>`<option value="${esc(c)}" ${existing?.target_value===c?'selected':''}>${esc(c)}</option>`).join('')}</select>`;else if(type.value==='ITEM')field.innerHTML=`<label>Menu item</label><select name="value">${state.menu.filter(m=>m.available).map(m=>`<option value="${m.id}" ${existing?.target_value===m.id?'selected':''}>${esc(m.name)} — ${esc(m.category)}</option>`).join('')}</select>`;else field.innerHTML=''};type.addEventListener('change',paintTarget);paintTarget();
  edit.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const payload={title:clean(fd.get('title')),subtitle:clean(fd.get('subtitle'))||null,cta_label:clean(fd.get('cta'))||'Explore menu',target_type:fd.get('type'),target_value:fd.get('type')==='MENU'?null:clean(fd.get('value'))||null,active:fd.get('active')==='on',updated_at:new Date().toISOString()};if(!payload.title)return toast('Add a banner headline.');let error;if(existing)({error}=await supabase.from('home_banners').update(payload).eq('id',existing.id));else({error}=await supabase.from('home_banners').insert({...payload,sort_order:state.banners.length}));if(error)return toast(error.message);close();await reloadManager(manager)});
}

function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{renderNavigation();renderHomeBanners();renderHotFavourites();renderCategoryStrip();renderAdminButton()},100)}
const observer=new MutationObserver(scheduleRender);observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',()=>{loadOrderCount().then(scheduleRender)});
supabase?.auth?.onAuthStateChange(()=>setTimeout(loadContext,100));
loadContext();
