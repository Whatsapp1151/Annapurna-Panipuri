import {supabase,configured} from './supabase';

let latestAccount=null;
let channel=null;
let observer=null;

function money(n){return '£'+Number(n||0).toFixed(2)}

function patchPoints(){
  if(!latestAccount)return;
  document.querySelectorAll('.pointsCard').forEach(card=>{
    const main=card.querySelector('strong');
    if(main)main.textContent=`⭐ ${latestAccount.points_balance||0} Points`;
    const value=card.querySelector('p b');
    if(value)value.textContent=money((latestAccount.points_balance||0)*0.05);
    const earned=card.querySelector('.stats div:first-child b');
    if(earned)earned.textContent=String(latestAccount.lifetime_points_earned||0);
    const redeemed=card.querySelector('.stats div:nth-child(2) b');
    if(redeemed)redeemed.textContent=String(latestAccount.lifetime_points_redeemed||0);
  });
}

function showToast(points){
  document.querySelector('.ap-loyalty-live-toast')?.remove();
  const el=document.createElement('div');
  el.className='ap-loyalty-live-toast';
  el.textContent=`⭐ ${points} point${points===1?'':'s'} added from your completed order`;
  Object.assign(el.style,{position:'fixed',left:'16px',right:'16px',top:'calc(env(safe-area-inset-top, 0px) + 16px)',zIndex:'99999',padding:'14px 16px',borderRadius:'16px',background:'#244d1c',color:'#fff',font:'700 15px system-ui,-apple-system,sans-serif',boxShadow:'0 10px 30px rgba(0,0,0,.18)',textAlign:'center',pointerEvents:'none'});
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3500);
}

async function refreshAccount(customerId,points){
  const {data}=await supabase.from('loyalty_accounts').select('*').eq('customer_id',customerId).maybeSingle();
  if(data){latestAccount=data;patchPoints();}
  if(points>0)showToast(points);
}

async function subscribeForSession(session){
  if(channel){await supabase.removeChannel(channel);channel=null;}
  latestAccount=null;
  if(!session?.user)return;
  const {data:profile}=await supabase.from('customer_profiles').select('customer_id').eq('auth_user_id',session.user.id).maybeSingle();
  if(!profile?.customer_id)return;

  channel=supabase.channel('customer-loyalty-auto-'+profile.customer_id)
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders',filter:'customer_id=eq.'+profile.customer_id},payload=>{
      if(payload.new?.status==='COMPLETED'&&payload.old?.status!=='COMPLETED'){
        const pts=Math.max(0,Math.floor(Number(payload.new?.total||0)));
        setTimeout(()=>refreshAccount(profile.customer_id,pts),250);
      }
    }).subscribe();
}

if(configured){
  supabase.auth.getSession().then(({data})=>subscribeForSession(data.session));
  supabase.auth.onAuthStateChange((_event,session)=>subscribeForSession(session));
  observer=new MutationObserver(()=>patchPoints());
  observer.observe(document.documentElement,{childList:true,subtree:true});
}
