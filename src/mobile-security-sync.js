import {supabase,configured} from './supabase';

const DAY=24*60*60*1000;
const MAX=3;
let syncing=false;
let modalOpen=false;

const clean=v=>String(v??'').trim();
function normalisePhone(value){
  let v=clean(value).replace(/[ ()-]/g,'');
  if(v.startsWith('00'))v='+'+v.slice(2);
  if(/^07\d{9}$/.test(v))v='+44'+v.slice(1);
  if(/^44\d{10}$/.test(v))v='+'+v;
  return v;
}
function validPhone(v){return /^\+[1-9]\d{7,14}$/.test(normalisePhone(v))}
function safeKey(phone){return normalisePhone(phone).replace(/\D/g,'')}
function readTimes(key){try{return JSON.parse(localStorage.getItem(key)||'[]').filter(Number.isFinite)}catch{return []}}
function writeTimes(key,list){try{localStorage.setItem(key,JSON.stringify(list.slice(-20)))}catch{}}
function formatWait(ms){const h=Math.ceil(ms/3600000);return h<=1?'about 1 hour':`about ${h} hours`}
function otpGuard(phone){
  const now=Date.now(),key='ap-sms-'+safeKey(phone);
  const times=readTimes(key).filter(t=>now-t<DAY);
  const lock=Number(localStorage.getItem('ap-sms-lock-'+safeKey(phone))||0);
  if(lock>now)return {ok:false,message:`3/3 OTP requests used. Try again in ${formatWait(lock-now)}.`};
  if(times.length>=MAX){const until=(times[times.length-1]||now)+DAY;try{localStorage.setItem('ap-sms-lock-'+safeKey(phone),String(until))}catch{};return {ok:false,message:`3/3 OTP requests used. Try again in ${formatWait(until-now)}.`}}
  return {ok:true};
}
function recordOtp(phone){
  const now=Date.now(),key='ap-sms-'+safeKey(phone);
  const times=[...readTimes(key).filter(t=>now-t<DAY),now];writeTimes(key,times);
  if(times.length>=MAX){try{localStorage.setItem('ap-sms-lock-'+safeKey(phone),String(now+DAY))}catch{}}
}
function toast(message){
  document.querySelector('.ap-mobile-security-toast')?.remove();
  const el=document.createElement('div');el.className='ap-mobile-security-toast';el.textContent=message;
  Object.assign(el.style,{position:'fixed',left:'16px',right:'16px',top:'calc(env(safe-area-inset-top,0px) + 16px)',zIndex:'140000',padding:'14px 16px',borderRadius:'14px',background:'#244d1c',color:'#fff',font:'700 14px system-ui,-apple-system,sans-serif',boxShadow:'0 10px 28px rgba(0,0,0,.2)',textAlign:'center'});
  document.body.appendChild(el);setTimeout(()=>el.remove(),3600);
}

async function syncVerifiedMobile(){
  if(!configured||syncing)return;
  syncing=true;
  try{
    const {data:{session}}=await supabase.auth.getSession();
    const user=session?.user;if(!user?.id||!user?.phone)return;
    const phoneConfirmed=user.phone_confirmed_at||user.confirmed_at;
    if(!phoneConfirmed)return;
    const {data:profile}=await supabase.from('customer_profiles').select('mobile_number,mobile_verified_at,full_name').eq('auth_user_id',user.id).maybeSingle();
    if(!profile)return;
    const same=safeKey(profile.mobile_number)===safeKey(user.phone);
    if(profile.mobile_verified_at&&same)return;
    const {error}=await supabase.rpc('sync_verified_mobile');if(error)return;
    document.querySelector('.verifyBanner')?.remove();
    if(clean(profile.full_name))document.querySelector('.profile-complete-banner')?.remove();
    try{await supabase.auth.refreshSession()}catch{}
  }catch{}finally{syncing=false}
}

function addStyles(){
  if(document.getElementById('ap-secure-mobile-css'))return;
  const s=document.createElement('style');s.id='ap-secure-mobile-css';s.textContent=`
  .ap-secure-mobile{position:fixed;inset:0;z-index:135000;background:rgba(17,26,15,.76);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;backdrop-filter:blur(5px)}
  .ap-secure-mobile-sheet{width:min(430px,100%);max-height:92vh;overflow:auto;background:#fffaf0;border:1px solid #e3d39f;border-radius:24px;padding:24px;box-sizing:border-box;color:#203b1b;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 24px 70px rgba(0,0,0,.3)}
  .ap-secure-mobile-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.ap-secure-mobile-head h2{margin:0;font-size:24px}.ap-secure-mobile-x{border:0;background:#eee8d7;width:38px;height:38px;border-radius:50%;font-size:24px;color:#244d1c}
  .ap-secure-mobile-sheet p{line-height:1.45;color:#566052}.ap-secure-mobile-sheet form{display:grid;gap:11px}.ap-secure-mobile-sheet input{width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #cfc7ad;border-radius:12px;background:#fff;font:inherit;font-size:16px}.ap-secure-mobile-primary{border:0;background:#244d1c;color:#fff;padding:13px;border-radius:12px;font:inherit;font-weight:800}.ap-secure-mobile-primary:disabled{opacity:.55}.ap-secure-mobile-status{min-height:22px;color:#8a5a00!important;font-weight:700;font-size:14px}.ap-secure-mobile-note{background:#fff3cf;border:1px solid #ecd18a;border-radius:12px;padding:11px;font-size:13px}
  `;document.head.appendChild(s);
}
function closeModal(){document.querySelector('.ap-secure-mobile')?.remove();modalOpen=false}
function base(title,body){
  addStyles();document.querySelector('.ap-secure-mobile')?.remove();
  const wrap=document.createElement('div');wrap.className='ap-secure-mobile';wrap.innerHTML=`<div class="ap-secure-mobile-sheet"><div class="ap-secure-mobile-head"><h2>${title}</h2><button class="ap-secure-mobile-x" type="button">×</button></div>${body}<p class="ap-secure-mobile-status"></p></div>`;
  document.body.appendChild(wrap);wrap.querySelector('.ap-secure-mobile-x').onclick=closeModal;wrap.onclick=e=>{if(e.target===wrap)closeModal()};return wrap;
}
function setStatus(text){const el=document.querySelector('.ap-secure-mobile-status');if(el)el.textContent=text||''}

async function openSecureMobileChange(){
  if(modalOpen)return;modalOpen=true;
  const {data:{session}}=await supabase.auth.getSession();if(!session){modalOpen=false;return toast('Please log in first.')}
  const {data:profile}=await supabase.from('customer_profiles').select('mobile_number,mobile_verified_at').eq('auth_user_id',session.user.id).maybeSingle();
  const currentPhone=normalisePhone(profile?.mobile_number||session.user.phone||'');
  if(!validPhone(currentPhone)){modalOpen=false;return toast('Your current mobile number could not be loaded.')}

  const stepPassword=()=>{
    const w=base('Confirm your password',`<p>For security, enter your current password before changing your mobile number.</p><div class="ap-secure-mobile-note">Current number: <b>${currentPhone}</b></div><form><input name="password" type="password" autocomplete="current-password" placeholder="Current password" minlength="8" required><button class="ap-secure-mobile-primary" type="submit">Confirm Password</button></form>`);
    w.querySelector('form').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');const password=new FormData(e.currentTarget).get('password');btn.disabled=true;btn.textContent='Checking…';try{const {data,error}=await supabase.auth.signInWithPassword({phone:currentPhone,password:String(password||'')});if(error)throw error;if(data?.user?.id!==session.user.id)throw new Error('Account verification failed.');stepNewNumber()}catch{setStatus('Password is incorrect. The mobile number cannot be changed.');btn.disabled=false;btn.textContent='Confirm Password'}};
  };

  const stepNewNumber=()=>{
    const w=base('Change mobile number',`<p>Password confirmed. Enter the new mobile number you want to use.</p><form><input name="mobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="New mobile number" required><button class="ap-secure-mobile-primary" type="submit">Send OTP to New Number</button></form><div class="ap-secure-mobile-note">The number will not change until the OTP sent to the new number is verified.</div>`);
    w.querySelector('form').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');const phone=normalisePhone(new FormData(e.currentTarget).get('mobile'));if(!validPhone(phone))return setStatus('Enter a valid mobile number.');if(safeKey(phone)===safeKey(currentPhone))return setStatus('Enter a different mobile number.');const guard=otpGuard(phone);if(!guard.ok)return setStatus(guard.message);btn.disabled=true;btn.textContent='Sending OTP…';try{const {error}=await supabase.auth.updateUser({phone});if(error)throw error;recordOtp(phone);stepOtp(phone)}catch(err){setStatus(err?.message||'Could not send OTP.');btn.disabled=false;btn.textContent='Send OTP to New Number'}};
  };

  const stepOtp=newPhone=>{
    const w=base('Verify new mobile number',`<p>Enter the SMS OTP sent to <b>${newPhone}</b>.</p><form><input name="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit OTP" maxlength="10" required><button class="ap-secure-mobile-primary" type="submit">Verify & Change Number</button></form>`);
    w.querySelector('form').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');const token=String(new FormData(e.currentTarget).get('otp')||'').replace(/\D/g,'');if(token.length<6)return setStatus('Enter the OTP from the SMS.');btn.disabled=true;btn.textContent='Verifying…';try{const {error}=await supabase.auth.verifyOtp({phone:newPhone,token,type:'phone_change'});if(error)throw error;const {error:syncError}=await supabase.rpc('sync_verified_mobile');if(syncError)throw syncError;try{await supabase.auth.refreshSession()}catch{};closeModal();toast('✅ Mobile number changed and verified successfully.')}catch(err){setStatus(err?.message||'OTP verification failed.');btn.disabled=false;btn.textContent='Verify & Change Number'}};
  };

  stepPassword();
}

// Stop the older direct phone-change modal. A mobile number change now requires
// current-password confirmation first.
document.addEventListener('click',event=>{
  const button=event.target.closest?.('.accountActions button');if(!button)return;
  const text=clean(button.textContent).toLowerCase();
  if(text.includes('mobile number')||text.includes('re-verify mobile')){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();void openSecureMobileChange();
  }
},true);

if(configured){
  setTimeout(()=>void syncVerifiedMobile(),250);
  window.addEventListener('focus',()=>void syncVerifiedMobile());
  supabase.auth.onAuthStateChange(()=>setTimeout(()=>void syncVerifiedMobile(),150));
}
