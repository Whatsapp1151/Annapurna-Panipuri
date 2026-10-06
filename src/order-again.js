import {supabase,configured} from './supabase';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clean=v=>String(v??'').trim();

function toast(message,kind='ok'){
  document.querySelector('.ap-order-again-toast')?.remove();
  const el=document.createElement('div');
  el.className='ap-order-again-toast '+(kind==='error'?'error':'');
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3500);
}

function findSection(label){
  const wanted=clean(label).toUpperCase();
  for(const eyebrow of document.querySelectorAll('.eyebrow')){
    if(clean(eyebrow.textContent).toUpperCase()===wanted){
      const section=eyebrow.closest('section');
      if(section)return section;
    }
  }
  return null;
}

function menuNavButton(){
  return [...document.querySelectorAll('nav button')].find(b=>clean(b.querySelector('span')?.textContent).toLowerCase()==='menu');
}

async function waitForMenu(timeout=4000){
  const start=Date.now();
  while(Date.now()-start<timeout){
    const rows=[...document.querySelectorAll('.menuRow')];
    if(rows.length)return rows;
    await sleep(80);
  }
  throw new Error('Menu did not open in time.');
}

function findMenuRow(name){
  const wanted=clean(name).toLowerCase();
  return [...document.querySelectorAll('.menuRow')].find(r=>clean(r.querySelector('b')?.textContent).toLowerCase()===wanted);
}

async function addOne(name){
  const row=findMenuRow(name);if(!row)return false;
  let button=row.querySelector('.addBtn');
  if(!button)button=[...row.querySelectorAll('.qty button')].find(b=>clean(b.textContent)==='+');
  if(!button)return false;
  button.click();await sleep(70);return true;
}

async function reorder(orderNumber,button){
  if(!configured)return toast('App connection is not ready.','error');
  button.disabled=true;const original=button.innerHTML;button.textContent='Adding to basket…';
  try{
    const {data:order,error}=await supabase.from('orders').select('order_id,order_number,order_items(menu_item_id,item_name,quantity)').eq('order_number',orderNumber).maybeSingle();
    if(error)throw error;if(!order)throw new Error('This order could not be found.');
    const items=(order.order_items||[]).filter(i=>Number(i.quantity)>0);
    if(!items.length)throw new Error('This order has no items to add again.');
    const ids=[...new Set(items.map(i=>i.menu_item_id).filter(Boolean))];
    let menuMap=new Map();
    if(ids.length){const {data:menu}=await supabase.from('menu_items').select('id,name,available').in('id',ids);menuMap=new Map((menu||[]).map(m=>[m.id,m]))}
    if(document.querySelector('.cartFloat')&&!confirm('Your basket already has items. Order Again will add these items to your existing basket. Continue?'))return;
    const nav=menuNavButton();if(!nav)throw new Error('Menu button could not be found.');nav.click();await waitForMenu();
    let added=0;const skipped=[];
    for(const item of items){
      const current=menuMap.get(item.menu_item_id);
      if(current?.available===false){skipped.push(item.item_name);continue}
      const name=current?.name||item.item_name;let ok=true;
      for(let i=0;i<Number(item.quantity);i++){if(!(await addOne(name))){ok=false;break}added++}
      if(!ok)skipped.push(item.item_name);
    }
    if(!added)throw new Error('None of the items from this order are currently available.');
    toast(skipped.length?`✅ ${added} item${added===1?'':'s'} added. Some unavailable items were skipped.`:`✅ Order #${orderNumber} added to your basket.`);
  }catch(e){toast(e?.message||'Could not add this order again.','error')}
  finally{button.disabled=false;button.innerHTML=original}
}

function isCompleted(card){
  if(card.classList.contains('status-completed'))return true;
  return /completed/i.test(clean(card.querySelector('.statusPill')?.textContent));
}

function renderButtons(){
  const page=findSection('MY ORDERS')||document.querySelector('.orderCard')?.closest('section');
  if(!page)return;
  page.querySelectorAll('.orderCard').forEach(card=>{
    if(!isCompleted(card)||card.querySelector('.ap-order-again'))return;
    const orderNumber=clean(card.querySelector('.orderTop h2')?.textContent).replace(/\D/g,'');
    if(!orderNumber)return;
    const btn=document.createElement('button');btn.type='button';btn.className='ap-order-again';btn.innerHTML='<span>↻</span> Order Again';
    btn.addEventListener('click',()=>reorder(orderNumber,btn));
    const orderedAt=card.querySelector('.orderedAt');
    if(orderedAt)orderedAt.insertAdjacentElement('beforebegin',btn);else card.appendChild(btn);
  });
}

setInterval(renderButtons,650);
window.addEventListener('focus',renderButtons);
document.addEventListener('click',e=>{
  const label=clean(e.target.closest?.('button')?.textContent).toLowerCase();
  if(label.includes('my orders'))setTimeout(renderButtons,180);
},true);
renderButtons();
