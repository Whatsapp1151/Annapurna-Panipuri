import {supabase,configured} from './supabase';

let renderTimer=null;
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

function menuNavButton(){
  return [...document.querySelectorAll('nav button')].find(b=>clean(b.querySelector('span')?.textContent)==='Menu');
}

async function waitForMenu(timeout=3500){
  const start=Date.now();
  while(Date.now()-start<timeout){
    const rows=[...document.querySelectorAll('.menuRow')];
    if(rows.length)return rows;
    await sleep(60);
  }
  throw new Error('Menu did not open in time.');
}

function findMenuRow(name){
  return [...document.querySelectorAll('.menuRow')].find(r=>clean(r.querySelector('b')?.textContent)===clean(name));
}

async function addOne(name){
  let row=findMenuRow(name);
  if(!row)return false;
  let button=row.querySelector('.addBtn');
  if(!button){
    button=[...row.querySelectorAll('.qty button')].find(b=>clean(b.textContent)==='+');
  }
  if(!button)return false;
  button.click();
  await sleep(55);
  return true;
}

async function reorder(orderNumber,button){
  if(!configured)return toast('App connection is not ready.','error');
  button.disabled=true;
  const original=button.textContent;
  button.textContent='Adding to basket…';
  try{
    const {data:order,error}=await supabase.from('orders')
      .select('order_id,order_number,order_items(menu_item_id,item_name,quantity)')
      .eq('order_number',orderNumber)
      .maybeSingle();
    if(error)throw error;
    if(!order)throw new Error('This order could not be found.');
    const items=(order.order_items||[]).filter(i=>Number(i.quantity)>0);
    if(!items.length)throw new Error('This order has no items to add again.');

    const ids=[...new Set(items.map(i=>i.menu_item_id).filter(Boolean))];
    let menuMap=new Map();
    if(ids.length){
      const {data:menu}=await supabase.from('menu_items').select('id,name,available').in('id',ids);
      menuMap=new Map((menu||[]).map(m=>[m.id,m]));
    }

    if(document.querySelector('.cartFloat')){
      if(!confirm('Your basket already has items. Order Again will add these items to your existing basket. Continue?'))return;
    }

    menuNavButton()?.click();
    await waitForMenu();
    let added=0,skipped=[];
    for(const item of items){
      const current=menuMap.get(item.menu_item_id);
      if(current?.available===false){skipped.push(item.item_name);continue}
      const name=current?.name||item.item_name;
      let ok=true;
      for(let i=0;i<Number(item.quantity);i++){
        const did=await addOne(name);
        if(!did){ok=false;break}
        added++;
      }
      if(!ok)skipped.push(item.item_name);
    }
    if(!added)throw new Error('None of the items from this order are currently available.');
    toast(skipped.length?`✅ ${added} item${added===1?'':'s'} added. Some unavailable items were skipped.`:`✅ Order #${orderNumber} added to your basket.`);
  }catch(e){
    toast(e?.message||'Could not add this order again.','error');
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

function renderButtons(){
  const page=[...document.querySelectorAll('section')].find(s=>clean(s.querySelector('.eyebrow')?.textContent)==='MY ORDERS');
  if(!page)return;
  page.querySelectorAll('.orderCard.status-completed').forEach(card=>{
    if(card.querySelector('.ap-order-again'))return;
    const orderNumber=clean(card.querySelector('.orderTop h2')?.textContent).replace('#','');
    if(!orderNumber)return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='ap-order-again';
    btn.innerHTML='<span>↻</span> Order Again';
    btn.addEventListener('click',()=>reorder(orderNumber,btn));
    const orderedAt=card.querySelector('.orderedAt');
    if(orderedAt)orderedAt.insertAdjacentElement('beforebegin',btn);else card.appendChild(btn);
  });
}

function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(renderButtons,100)}
const observer=new MutationObserver(m=>{if(m.some(x=>x.addedNodes.length||x.removedNodes.length))scheduleRender()});
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',scheduleRender);
scheduleRender();
