import {supabase,configured} from './supabase';

let timer=null;
let loading=false;

function isPointsHistoryVisible(){
  return [...document.querySelectorAll('.adminBox h2')].some(h=>String(h.textContent||'').trim()==='Recent point transactions');
}

async function addCustomerIds(){
  if(!configured||loading||!isPointsHistoryVisible())return;
  const rows=[...document.querySelectorAll('.txRow')];
  if(!rows.length||rows.every(r=>r.querySelector('.ap-customer-id')))return;
  loading=true;
  try{
    const {data,error}=await supabase
      .from('loyalty_transactions')
      .select('transaction_id,customer_id,created_at')
      .order('created_at',{ascending:false})
      .limit(40);
    if(error||!data)return;
    rows.forEach((row,i)=>{
      const tx=data[i];
      if(!tx?.customer_id||row.querySelector('.ap-customer-id'))return;
      const info=row.querySelector('div');
      if(!info)return;
      const id=document.createElement('small');
      id.className='ap-customer-id';
      id.textContent='Customer ID: '+tx.customer_id;
      id.title='Tap to copy customer ID';
      id.addEventListener('click',async()=>{
        try{await navigator.clipboard.writeText(tx.customer_id);id.textContent='Customer ID copied ✓';setTimeout(()=>id.textContent='Customer ID: '+tx.customer_id,1200)}catch{}
      });
      info.appendChild(id);
    });
  }finally{loading=false}
}

function schedule(){clearTimeout(timer);timer=setTimeout(addCustomerIds,120)}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',schedule);
schedule();
