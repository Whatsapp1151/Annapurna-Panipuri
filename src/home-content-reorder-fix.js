import {supabase,configured} from './supabase';

let refreshTimer=null;

function showToast(message){
  document.querySelector('.ap-reorder-toast')?.remove();
  const el=document.createElement('div');
  el.className='ap-reorder-toast';
  el.textContent=message;
  Object.assign(el.style,{position:'fixed',left:'50%',bottom:'96px',transform:'translateX(-50%)',zIndex:'9999',background:'#173f18',color:'#fff',padding:'11px 15px',borderRadius:'12px',fontWeight:'800',boxShadow:'0 10px 28px #0004',maxWidth:'calc(100% - 28px)',textAlign:'center'});
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),2200);
}

async function saveSequentialOrder(table,rows){
  // First move every row into a temporary range, then save 0..n-1.
  // This also repairs any duplicate/gapped sort_order values left by older versions.
  for(let i=0;i<rows.length;i++){
    const {error}=await supabase.from(table).update({sort_order:1000+i}).eq('id',rows[i].id);
    if(error)throw error;
  }
  for(let i=0;i<rows.length;i++){
    const {error}=await supabase.from(table).update({sort_order:i}).eq('id',rows[i].id);
    if(error)throw error;
  }
}

function swapVisibleManagerRow(button,direction){
  const row=button.closest('.ap-manager-row');
  const list=row?.parentElement;
  if(!row||!list)return;
  if(direction<0){
    const prev=row.previousElementSibling;
    if(prev)list.insertBefore(row,prev);
  }else{
    const next=row.nextElementSibling;
    if(next)list.insertBefore(next,row);
  }
  const rows=[...list.querySelectorAll(':scope > .ap-manager-row')];
  rows.forEach((r,i)=>{
    const up=r.querySelector('[data-fav-up],[data-banner-up]');
    const down=r.querySelector('[data-fav-down],[data-banner-down]');
    if(up)up.disabled=i===0;
    if(down)down.disabled=i===rows.length-1;
  });
}

async function handleReorder(button){
  const isFavourite=button.hasAttribute('data-fav-up')||button.hasAttribute('data-fav-down');
  const isBanner=button.hasAttribute('data-banner-up')||button.hasAttribute('data-banner-down');
  if(!isFavourite&&!isBanner)return false;

  const table=isFavourite?'home_hot_favourites':'home_banners';
  const id=button.dataset.favUp||button.dataset.favDown||button.dataset.bannerUp||button.dataset.bannerDown;
  const direction=(button.hasAttribute('data-fav-up')||button.hasAttribute('data-banner-up'))?-1:1;

  button.disabled=true;
  try{
    const {data,error}=await supabase.from(table).select('id,sort_order,created_at').order('sort_order').order('created_at').order('id');
    if(error)throw error;
    const rows=data||[];
    const from=rows.findIndex(r=>r.id===id),to=from+direction;
    if(from<0||to<0||to>=rows.length)return true;
    [rows[from],rows[to]]=[rows[to],rows[from]];
    await saveSequentialOrder(table,rows);
    swapVisibleManagerRow(button,direction);
    await refreshVisibleHomeOrder();
    showToast('Order updated ✓');
  }catch(error){
    console.error(error);
    showToast(error?.message||'Could not change the order.');
    button.disabled=false;
  }
  return true;
}

async function refreshVisibleHomeOrder(){
  if(!configured)return;
  const hot=document.querySelector('.ap-hot-grid');
  if(hot){
    const {data}=await supabase.from('home_hot_favourites').select('menu_item_id,sort_order,created_at').eq('active',true).order('sort_order').order('created_at');
    (data||[]).forEach(row=>{
      const card=hot.querySelector(`[data-hot-id="${row.menu_item_id}"]`);
      if(card)hot.appendChild(card);
    });
  }
  const track=document.querySelector('.ap-banner-track');
  if(track){
    const {data}=await supabase.from('home_banners').select('id,sort_order,created_at').eq('active',true).order('sort_order').order('created_at');
    (data||[]).forEach(row=>{
      const card=track.querySelector(`[data-banner-id="${row.id}"]`);
      if(card)track.appendChild(card);
    });
  }
}

document.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-fav-up],[data-fav-down],[data-banner-up],[data-banner-down]');
  if(!button||!configured)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  await handleReorder(button);
},true);

const observer=new MutationObserver(()=>{
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(refreshVisibleHomeOrder,120);
});
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',refreshVisibleHomeOrder);
