import {supabase,configured} from './supabase';

let latestAccount=null;
let channel=null;
let observer=null;
let patchQueued=false;

function money(n){return '£'+Number(n||0).toFixed(2)}
function setText(el,value){if(el&&el.textContent!==String(value))el.textContent=String(value)}

function patchPoints(){
  patchQueued=false;
  if(!latestAccount)return;
  document.querySelectorAll('.pointsCard').forEach(card=>{
    setText(card.querySelector('strong'),`⭐ ${latestAccount.points_balance||0} Points`);
    setText(card.querySelector('p b'),money((latestAccount.points_balance||0)*0.05));
    setText(card.querySelector('.stats div:first-child b'),String(latestAccount.lifetime_points_earned||0));
    setText(card.querySelector('.stats div:nth-child(2) b'),String(latestAccount.lifetime_points_redeemed||0));
  });
}

function queuePatch(){
  if(patchQueued)return;
  patchQueued=true;
  requestAnimationFrame(patchPoints);
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
  try{
    const {data,error}=await supabase.from('loyalty_accounts').select('*').eq('customer_id',customerId).maybeSingle();
    if(error)return;
    if(data){latestAccount=data;queuePatch()}
    if(points>0)showToast(points);
  }catch{}
}

async function subscribeForSession(session){
  try{
    if(channel){await supabase.removeChannel(channel);channel=null}
    latestAccount=null;
    if(!session?.user)return;
    const {data:profile}=await supabase.from('customer_profiles').select('customer_id').eq('auth_user_id',session.user.id).maybeSingle();
    if(!profile?.customer_id)return;

    channel=supabase.channel('customer-loyalty-auto-'+profile.customer_id)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders',filter:'customer_id=eq.'+profile.customer_id},payload=>{
        if(payload.new?.status==='COMPLETED'&&payload.old?.status!=='COMPLETED'){
          const pts=Math.max(0,Math.floor(Number(payload.new?.total||0)));
          setTimeout(()=>void refreshAccount(profile.customer_id,pts),300);
        }
      }).subscribe();
  }catch{}
}

if(configured){
  supabase.auth.getSession().then(({data})=>void subscribeForSession(data.session)).catch(()=>{});
  supabase.auth.onAuthStateChange((_event,session)=>{void subscribeForSession(session)});
  observer=new MutationObserver(()=>queuePatch());
  const root=document.getElementById('root')||document.body;
  observer.observe(root,{childList:true,subtree:true});
}
