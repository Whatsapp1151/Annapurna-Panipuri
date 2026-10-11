import {supabase,configured} from './supabase';

const WINDOW_MS=10*60*1000;
let running=false;
let queued=false;
let lastRun=0;

const money=n=>'£'+Number(n||0).toFixed(2);
const clean=v=>String(v??'').trim();
const orderNoFromCard=card=>Number(clean(card?.querySelector('.orderTop h2')?.textContent).replace(/\D/g,''))||null;
function setText(el,value){const next=String(value);if(el&&el.textContent!==next)el.textContent=next}

function groupBursts(orders){
  const byCustomer=new Map();
  for(const o of orders.filter(x=>x.status==='COMPLETED'&&x.completed_at)){
    const key=o.customer_id||'customer';
    if(!byCustomer.has(key))byCustomer.set(key,[]);
    byCustomer.get(key).push(o);
  }
  const groups=[];
  for(const list of byCustomer.values()){
    list.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    let current=[];
    let started=0;
    for(const o of list){
      const t=new Date(o.created_at).getTime();
      if(!current.length){current=[o];started=t;continue}
      if(t-started<=WINDOW_MS)current.push(o);
      else{if(current.length>1)groups.push(current);current=[o];started=t}
    }
    if(current.length>1)groups.push(current);
  }
  return groups;
}

function combinedItems(group){
  const map=new Map();
  for(const o of group){
    for(const i of o.order_items||[]){
      const key=[i.menu_item_id||'',i.item_name,Number(i.unit_price||0),i.item_notes||''].join('|');
      const old=map.get(key)||{item_name:i.item_name,quantity:0,line_total:0};
      old.quantity+=Number(i.quantity||0);
      old.line_total+=Number(i.line_total||0);
      map.set(key,old);
    }
  }
  return [...map.values()];
}

function addNote(card,group){
  const host=card.querySelector('.orderTop>div');if(!host)return;
  const others=group.slice(1).map(o=>'#'+o.order_number).join(', ');
  let note=host.querySelector('.ap-combined-order-note');
  if(!note){note=document.createElement('small');note.className='ap-combined-order-note';host.appendChild(note)}
  setText(note,`Combined order • includes ${others}`);
  Object.assign(note.style,{display:'block',marginTop:'4px',fontWeight:'800',color:'#8a5a00'});
}

function paintItems(card,group){
  const box=card.querySelector('.orderItems');if(!box)return;
  const items=combinedItems(group);
  const sig=items.map(i=>`${i.item_name}:${i.quantity}:${i.line_total}`).join('|');
  if(box.dataset.apCombinedSig===sig)return;
  box.dataset.apCombinedSig=sig;
  box.innerHTML=items.map(i=>`<div><span>${i.quantity} × ${escapeHtml(i.item_name)}</span><b>${money(i.line_total)}</b></div>`).join('');
}

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function resetCards(selector){
  document.querySelectorAll(selector).forEach(card=>{
    if(card.dataset.apGroupedHidden==='1'){card.style.display='';delete card.dataset.apGroupedHidden}
  });
}

function applyCustomer(groups){
  const section=[...document.querySelectorAll('section')].find(s=>clean(s.querySelector('.eyebrow')?.textContent)==='MY ORDERS');
  if(!section)return;
  resetCards('.orderCard');
  const cards=new Map([...section.querySelectorAll('.orderCard')].map(c=>[orderNoFromCard(c),c]));
  for(const group of groups){
    const primary=group[0];
    const card=cards.get(Number(primary.order_number));if(!card)continue;
    card.dataset.apCombinedGroup=group.map(o=>o.order_id).join('|');
    addNote(card,group);
    paintItems(card,group);
    const total=group.reduce((s,o)=>s+Number(o.total||0),0);
    setText(card.querySelector('.orderTotal b'),money(total));
    setText(card.querySelector('.orderedAt'),`Combined ${group.length} orders placed together • ${new Date(primary.created_at).toLocaleString('en-GB')}`);
    for(const o of group.slice(1)){
      const extra=cards.get(Number(o.order_number));
      if(extra){extra.dataset.apGroupedHidden='1';extra.style.display='none'}
    }
  }
}

function applyAdmin(groups){
  const board=document.querySelector('.orderBoard');if(!board)return;
  resetCards('.adminOrder');
  const cards=new Map([...board.querySelectorAll('.adminOrder')].map(c=>[orderNoFromCard(c),c]));
  for(const group of groups){
    const primary=group[0];
    const card=cards.get(Number(primary.order_number));if(!card)continue;
    addNote(card,group);
    paintItems(card,group);
    const total=group.reduce((s,o)=>s+Number(o.total||0),0);
    const pay=[...card.querySelectorAll('.orderMeta span')].find(x=>clean(x.textContent).startsWith('💷'));
    setText(pay,`💷 ${money(total)} • Pay at collection`);
    for(const o of group.slice(1)){
      const extra=cards.get(Number(o.order_number));
      if(extra){extra.dataset.apGroupedHidden='1';extra.style.display='none'}
    }
  }
}

async function run(){
  queued=false;
  if(running||!configured)return;
  const customerView=[...document.querySelectorAll('.eyebrow')].some(e=>clean(e.textContent)==='MY ORDERS');
  const adminView=Boolean(document.querySelector('.orderBoard'));
  if(!customerView&&!adminView)return;
  running=true;lastRun=Date.now();
  try{
    const {data:{session}}=await supabase.auth.getSession();if(!session)return;
    const [{data:profile},{data:roleRow}]=await Promise.all([
      supabase.from('customer_profiles').select('customer_id').eq('auth_user_id',session.user.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('auth_user_id',session.user.id).maybeSingle()
    ]);
    if(customerView&&profile?.customer_id){
      const {data}=await supabase.from('orders').select('order_id,order_number,customer_id,status,total,created_at,completed_at,order_items(order_item_id,menu_item_id,item_name,unit_price,quantity,line_total,item_notes)').eq('customer_id',profile.customer_id).order('created_at',{ascending:false}).limit(40);
      applyCustomer(groupBursts(data||[]));
    }
    if(adminView&&['STAFF','ADMIN'].includes(roleRow?.role)){
      const {data}=await supabase.from('orders').select('order_id,order_number,customer_id,status,total,created_at,completed_at,order_items(order_item_id,menu_item_id,item_name,unit_price,quantity,line_total,item_notes)').order('created_at',{ascending:false}).limit(80);
      applyAdmin(groupBursts(data||[]));
    }
  }catch(e){console.warn('Order grouping skipped',e)}finally{running=false}
}

function schedule(){
  if(queued)return;
  queued=true;
  const wait=Math.max(100,800-(Date.now()-lastRun));
  setTimeout(()=>void run(),wait);
}

const observer=new MutationObserver(schedule);
observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});
window.addEventListener('focus',schedule);
document.addEventListener('click',e=>{if(e.target.closest?.('nav button,.staffPill,.adminTabs button'))setTimeout(schedule,150)},true);
setTimeout(schedule,400);
