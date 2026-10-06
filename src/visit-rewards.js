import {supabase,configured} from './supabase';

let currentCustomerId=null;
let currentReward=null;
let loadingOwn=false;
let lastOwnLoad=0;
let staffSelectedCustomerId=null;
let staffBusy=false;

const clean=v=>String(v??'').trim();

function toast(message,kind='ok'){
  document.querySelector('.ap-visit-toast')?.remove();
  const el=document.createElement('div');
  el.className='ap-visit-toast '+(kind==='error'?'error':'');
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3400);
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

function myQrSection(){
  return findSection('MY QR')||document.querySelector('.qrCard')?.closest('section')||null;
}

async function loadOwnReward(force=false){
  if(!configured||loadingOwn)return;
  if(!force&&Date.now()-lastOwnLoad<5000&&currentReward)return;
  loadingOwn=true;
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){currentCustomerId=null;currentReward=null;return}
    const {data:profile}=await supabase.from('customer_profiles').select('customer_id').eq('auth_user_id',session.user.id).maybeSingle();
    currentCustomerId=profile?.customer_id||null;
    if(!currentCustomerId){currentReward={qualifying_visits:0,free_panipuri_available:0,lifetime_qualifying_visits:0};return}
    const {data}=await supabase.from('visit_rewards').select('qualifying_visits,free_panipuri_available,lifetime_qualifying_visits').eq('customer_id',currentCustomerId).maybeSingle();
    currentReward=data||{qualifying_visits:0,free_panipuri_available:0,lifetime_qualifying_visits:0};
    lastOwnLoad=Date.now();
  }catch{
    currentReward=currentReward||{qualifying_visits:0,free_panipuri_available:0,lifetime_qualifying_visits:0};
  }finally{loadingOwn=false}
}

function renderOwnReward(){
  const section=myQrSection();
  if(!section)return;
  const reward=currentReward||{qualifying_visits:0,free_panipuri_available:0,lifetime_qualifying_visits:0};
  const progress=Math.max(0,Math.min(4,Number(reward.qualifying_visits)||0));
  const available=Math.max(0,Number(reward.free_panipuri_available)||0);
  const lifetime=Math.max(0,Number(reward.lifetime_qualifying_visits)||0);
  const sig=[progress,available,lifetime].join(':');
  let card=section.querySelector('.ap-visit-reward-card');
  if(card?.dataset.sig===sig)return;
  if(!card){card=document.createElement('article');card.className='ap-visit-reward-card'}
  card.dataset.sig=sig;
  card.innerHTML=`
    <div class="ap-visit-top">
      <div><small>VISIT REWARD</small><h2>5 visits = Free Panipuri</h2></div>
      <div class="ap-visit-icon">🥣</div>
    </div>
    <p>Every <b>completed order over £5</b> counts as one qualifying visit.</p>
    <div class="ap-visit-progress" aria-label="${progress} of 5 qualifying visits completed">
      ${[0,1,2,3,4].map(i=>`<span class="${i<progress?'done':''}">${i<progress?'✓':i+1}</span>`).join('')}
    </div>
    <div class="ap-visit-status">
      <b>${progress}/5 qualifying visits</b>
      <span>${progress===4?'Just 1 more qualifying visit!':`${5-progress} more to your next free plate`}</span>
    </div>
    ${available>0?`<div class="ap-free-reward"><strong>🎉 ${available} FREE Panipuri ${available===1?'plate':'plates'} available</strong><span>Show your My QR code to staff to redeem at the counter.</span></div>`:''}
  `;
  const points=section.querySelector('.ap-qr-points,.pointsCard');
  const qr=section.querySelector('.qrCard');
  if(points)points.insertAdjacentElement('afterend',card);
  else if(qr)qr.insertAdjacentElement('beforebegin',card);
  else section.appendChild(card);
}

async function resolveCustomerFromButton(button){
  try{
    const email=clean(button.querySelector('small')?.textContent);
    const searchInput=document.querySelector('.adminBox .search input');
    const q=clean(searchInput?.value);
    let query=supabase.from('customer_profiles').select('customer_id,full_name,email');
    if(/^[0-9a-f-]{36}$/i.test(q))query=query.eq('customer_id',q);
    else if(email)query=query.eq('email',email);
    else query=query.eq('full_name',clean(button.querySelector('b')?.textContent));
    const {data}=await query.limit(1).maybeSingle();
    staffSelectedCustomerId=data?.customer_id||null;
    setTimeout(renderStaffReward,150);
  }catch{}
}

function selectedStaffBox(){
  return [...document.querySelectorAll('.adminBox')].find(b=>b.querySelector('h2')&&!b.querySelector('.search'))||null;
}

async function renderStaffReward(){
  if(!staffSelectedCustomerId||staffBusy)return;
  const box=selectedStaffBox();if(!box)return;
  staffBusy=true;
  try{
    const {data}=await supabase.from('visit_rewards').select('qualifying_visits,free_panipuri_available').eq('customer_id',staffSelectedCustomerId).maybeSingle();
    const reward=data||{qualifying_visits:0,free_panipuri_available:0};
    const progress=Math.max(0,Math.min(4,Number(reward.qualifying_visits)||0));
    const available=Math.max(0,Number(reward.free_panipuri_available)||0);
    const sig=[staffSelectedCustomerId,progress,available].join(':');
    let panel=box.querySelector('.ap-staff-visit-reward');
    if(panel?.dataset.sig===sig)return;
    panel?.remove();panel=document.createElement('div');panel.className='ap-staff-visit-reward';panel.dataset.sig=sig;
    panel.innerHTML=`<div><small>VISIT REWARD</small><b>${progress}/5 qualifying visits</b><span>${available} free Panipuri ${available===1?'plate':'plates'} available</span></div>${available>0?'<button type="button">Redeem 1 Free Panipuri</button>':'<em>No free plate ready yet</em>'}`;
    box.appendChild(panel);
    panel.querySelector('button')?.addEventListener('click',async()=>{
      if(!confirm('Redeem 1 free Panipuri plate for this customer now?'))return;
      const btn=panel.querySelector('button');btn.disabled=true;btn.textContent='Redeeming…';
      const {error}=await supabase.rpc('staff_redeem_visit_reward',{target_customer:staffSelectedCustomerId});
      if(error){toast(error.message||'Could not redeem reward.','error');btn.disabled=false;btn.textContent='Redeem 1 Free Panipuri';return}
      toast('✅ Free Panipuri reward redeemed.');panel.remove();setTimeout(renderStaffReward,150);
    });
  }finally{staffBusy=false}
}

document.addEventListener('click',e=>{
  const customer=e.target.closest?.('button.customer');
  if(customer)resolveCustomerFromButton(customer);
},true);

async function tick(){
  if(myQrSection()){
    await loadOwnReward();
    renderOwnReward();
  }
  if(staffSelectedCustomerId)renderStaffReward();
}

setInterval(()=>{void tick()},650);
window.addEventListener('focus',()=>{lastOwnLoad=0;void tick()});
supabase?.auth?.onAuthStateChange(()=>{currentCustomerId=null;currentReward=null;lastOwnLoad=0;setTimeout(()=>void tick(),150)});
void tick();
