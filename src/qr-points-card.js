import {supabase,configured} from './supabase';

let state={session:null,profile:null,account:null};
let renderTimer=null;
let loyaltyChannel=null;

const clean=v=>String(v??'').trim();
const money=n=>'£'+Number(n||0).toFixed(2);

async function loadState(){
  if(!configured)return;
  const {data:{session}}=await supabase.auth.getSession();
  state.session=session;state.profile=null;state.account=null;
  if(!session){unsubscribe();scheduleRender();return}
  const {data:profile}=await supabase.from('customer_profiles').select('customer_id').eq('auth_user_id',session.user.id).maybeSingle();
  state.profile=profile||null;
  if(profile){
    const {data:account}=await supabase.from('loyalty_accounts').select('points_balance,lifetime_points_earned,lifetime_points_redeemed').eq('customer_id',profile.customer_id).maybeSingle();
    state.account=account||null;
    subscribe(profile.customer_id);
  }
  scheduleRender();
}

function unsubscribe(){if(loyaltyChannel){supabase.removeChannel(loyaltyChannel);loyaltyChannel=null}}
function subscribe(customerId){
  unsubscribe();
  loyaltyChannel=supabase.channel('qr-points-'+customerId)
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'loyalty_accounts',filter:'customer_id=eq.'+customerId},async()=>{
      const {data}=await supabase.from('loyalty_accounts').select('points_balance,lifetime_points_earned,lifetime_points_redeemed').eq('customer_id',customerId).maybeSingle();
      state.account=data||state.account;scheduleRender();
    }).subscribe();
}

function hideHomePoints(){
  document.querySelectorAll('.pointsCard:not(.ap-qr-points)').forEach(card=>{
    if(card.style.display!=='none')card.style.display='none';
  });
}

function myQrSection(){
  return [...document.querySelectorAll('main > section')].find(s=>clean(s.querySelector('.pageHead .eyebrow')?.textContent)==='MY QR')||
    [...document.querySelectorAll('section')].find(s=>clean(s.querySelector('.pageHead .eyebrow')?.textContent)==='MY QR');
}

function openRewardHistory(){
  const nav=document.querySelector('nav');
  const btn=nav?.querySelector('[data-ap-orders-nav]')||[...nav?.querySelectorAll('button')||[]].find(b=>/my orders|history/i.test(clean(b.querySelector('span')?.textContent)));
  if(!btn)return;
  btn.removeAttribute('data-ap-orders-nav');
  btn.click();
}

function renderQrPoints(){
  const section=myQrSection();
  if(!section){document.querySelector('.ap-qr-points')?.remove();return}
  const a=state.account||{};
  const balance=Number(a.points_balance||0),earned=Number(a.lifetime_points_earned||0),redeemed=Number(a.lifetime_points_redeemed||0);
  const sig=[balance,earned,redeemed].join('|');
  let card=section.querySelector('.ap-qr-points');
  if(card?.dataset.sig===sig)return;
  if(!card){card=document.createElement('div');card.className='pointsCard ap-qr-points';const head=section.querySelector('.pageHead');head?.insertAdjacentElement('afterend',card)}
  card.dataset.sig=sig;
  card.innerHTML=`<small>YOUR POINTS</small><strong>⭐ ${balance} Points</strong><p>Reward Value <b>${money(balance*.05)}</b></p><div class="stats"><div><b>${earned}</b><span>Earned</span></div><div><b>${redeemed}</b><span>Redeemed</span></div></div><button type="button" data-view-reward-history>View rewards history <span aria-hidden="true">›</span></button>`;
  card.querySelector('[data-view-reward-history]')?.addEventListener('click',openRewardHistory);
}

function render(){hideHomePoints();renderQrPoints()}
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(render,80)}

const observer=new MutationObserver(scheduleRender);observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',loadState);
supabase?.auth?.onAuthStateChange(()=>setTimeout(loadState,100));
loadState();
