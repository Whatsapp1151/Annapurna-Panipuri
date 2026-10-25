import {supabase,configured} from './supabase';

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

async function reorder(orderNumber,button){
  if(!configured)return toast('App connection is not ready.','error');
  button.disabled=true;const original=button.innerHTML;button.textContent='Adding to basket…';
  try{
    const {data:order,error}=await supabase.from('orders').select('order_id,order_number,order_items(menu_item_id,item_name,quantity,toppings)').eq('order_number',orderNumber).maybeSingle();
    if(error)throw error;if(!order)throw new Error('This order could not be found.');
    const items=(order.order_items||[]).filter(i=>Number(i.quantity)>0);
    if(!items.length)throw new Error('This order has no items to add again.');
    if(document.querySelector('.cartFloat')&&!confirm('Add these items to your existing basket?'))return;
    const {added,skipped}=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Please reopen the app and try again.')),3000);
      window.dispatchEvent(new CustomEvent('annapurna:reorder-items',{detail:{items,done:result=>{clearTimeout(timer);resolve(result)}}}));
    });
    if(!added)throw new Error('Choose your pizzas and toppings from the menu. These older or unavailable items could not be added automatically.');
    toast(skipped.length?`${added} items added. Choose toppings again for older pizzas; unavailable items were skipped.`:`Order #${orderNumber} added with its selected toppings.`);
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
