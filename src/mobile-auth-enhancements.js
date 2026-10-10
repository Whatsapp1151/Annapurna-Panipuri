import {supabase,configured} from './supabase';

const COOLDOWN_MS=90_000;
const PHONE_WINDOW_MS=15*60_000;
const PHONE_DAY_MS=24*60*60_000;
const DEVICE_HOUR_MS=60*60_000;
const MAX_PHONE_15MIN=3;
const MAX_PHONE_DAY=3;
const MAX_DEVICE_HOUR=8;
let openedAt=0;
let mode='login';
let stage='form';
let pendingPhone='';
let pendingPurpose='';
let legacySession=false;

function normalisePhone(value){
  let v=String(value||'').trim().replace(/[ ()-]/g,'');
  if(v.startsWith('00'))v='+'+v.slice(2);
  if(/^07\d{9}$/.test(v))v='+44'+v.slice(1);
  if(/^44\d{10}$/.test(v))v='+'+v;
  return v;
}
function validPhone(v){return /^\+[1-9]\d{7,14}$/.test(normalisePhone(v))}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function safeKey(phone){return normalisePhone(phone).replace(/\D/g,'')}
function readTimes(key){try{return JSON.parse(localStorage.getItem(key)||'[]').filter(x=>Number.isFinite(x))}catch{return []}}
function writeTimes(key,list){try{localStorage.setItem(key,JSON.stringify(list.slice(-30)))}catch{}}
function lockKey(phone){return 'ap-sms-lock-'+safeKey(phone)}
function getLockUntil(phone){try{const n=Number(localStorage.getItem(lockKey(phone))||0);return Number.isFinite(n)?n:0}catch{return 0}}
function formatWait(ms){
  const mins=Math.max(1,Math.ceil(ms/60_000));
  if(mins<60)return mins+' minute'+(mins===1?'':'s');
  const hours=Math.ceil(mins/60);return hours+' hour'+(hours===1?'':'s');
}
function smsGuard(phone){
  const now=Date.now(),k=safeKey(phone);
  const lockUntil=getLockUntil(phone);
  if(lockUntil>now)return {ok:false,message:'You have used all 3 OTP requests. Please try again in '+formatWait(lockUntil-now)+'.'};
  if(lockUntil&&lockUntil<=now){try{localStorage.removeItem(lockKey(phone))}catch{}}
  const per=readTimes('ap-sms-'+k).filter(t=>now-t<PHONE_DAY_MS);
  const dev=readTimes('ap-sms-device').filter(t=>now-t<DEVICE_HOUR_MS);
  if(per.length>=MAX_PHONE_DAY){
    const until=(per[per.length-1]||now)+PHONE_DAY_MS;
    try{localStorage.setItem(lockKey(phone),String(until))}catch{}
    return {ok:false,message:'You have used all 3 OTP requests. Please try again in '+formatWait(until-now)+'.'};
  }
  if(per.length&&now-per[per.length-1]<COOLDOWN_MS)return {ok:false,message:'Please wait '+Math.ceil((COOLDOWN_MS-(now-per[per.length-1]))/1000)+' seconds before requesting another code.'};
  if(per.filter(t=>now-t<PHONE_WINDOW_MS).length>=MAX_PHONE_15MIN)return {ok:false,message:'Too many codes requested for this number. Please wait before trying again.'};
  if(dev.length>=MAX_DEVICE_HOUR)return {ok:false,message:'Too many verification requests from this device. Please wait before trying again.'};
  return {ok:true};
}
function recordSms(phone){
  const now=Date.now(),k=safeKey(phone);
  const per=[...readTimes('ap-sms-'+k).filter(t=>now-t<PHONE_DAY_MS),now];
  writeTimes('ap-sms-'+k,per);
  writeTimes('ap-sms-device',[...readTimes('ap-sms-device').filter(t=>now-t<DEVICE_HOUR_MS),now]);
  if(per.length>=MAX_PHONE_DAY){try{localStorage.setItem(lockKey(phone),String(now+PHONE_DAY_MS))}catch{}}
}
function friendlyError(e){
  const m=String(e?.message||e||'');
  if(/rate limit|too many requests|sms.*limit/i.test(m))return 'Too many SMS requests. Please wait before trying again.';
  if(/already registered|already exists|already belongs|duplicate/i.test(m))return 'This mobile number already has an Annapurna account. Log in, reset your password, or use “Activate old account” if you previously registered with email.';
  if(/invalid login credentials/i.test(m))return 'Mobile number or password is incorrect.';
  if(/phone.*not confirmed|not confirmed/i.test(m))return 'This mobile number still needs verification. Use Forgot password to verify the number and set a new password.';
  return m||'Could not continue. Please try again.';
}
function addStyles(){
  if(document.getElementById('ap-mobile-auth-css'))return;
  const s=document.createElement('style');s.id='ap-mobile-auth-css';s.textContent=`
  .ap-mobile-auth{position:fixed;inset:0;z-index:120000;background:rgba(17,26,15,.74);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;backdrop-filter:blur(5px)}
  .ap-mobile-sheet{width:min(430px,100%);max-height:92vh;overflow:auto;background:#fffaf0;border:1px solid #e6d5a5;border-radius:24px;padding:24px;box-sizing:border-box;box-shadow:0 24px 70px rgba(0,0,0,.3);color:#203b1b;font-family:system-ui,-apple-system,sans-serif}
  .ap-mobile-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.ap-mobile-head img{width:62px;height:62px;object-fit:contain}.ap-mobile-x{border:0;background:#eee8d7;width:38px;height:38px;border-radius:50%;font-size:24px;color:#244d1c}
  .ap-mobile-sheet h2{margin:12px 0 6px;font-size:25px}.ap-mobile-sheet p{margin:0 0 14px;line-height:1.45;color:#566052}.ap-mobile-sheet form{display:grid;gap:11px}.ap-mobile-sheet input{width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #cfc7ad;border-radius:12px;background:#fff;font:inherit;font-size:16px}
  .ap-mobile-primary,.ap-mobile-secondary,.ap-mobile-link{width:100%;padding:13px;border-radius:12px;font:inherit;font-weight:800;cursor:pointer}.ap-mobile-primary{border:0;background:#244d1c;color:#fff}.ap-mobile-secondary{border:1px solid #244d1c;background:#fff;color:#244d1c}.ap-mobile-link{border:0;background:transparent;color:#244d1c;text-decoration:underline}.ap-mobile-primary:disabled,.ap-mobile-secondary:disabled{opacity:.55;cursor:not-allowed}
  .ap-mobile-status{min-height:22px;margin:10px 0 0!important;font-size:14px;font-weight:700;color:#8a5a00!important}.ap-mobile-note{background:#fff3cf;border:1px solid #ecd18a;border-radius:12px;padding:11px;font-size:13px;line-height:1.45;margin:12px 0}.ap-mobile-otp{text-align:center;font-size:24px!important;letter-spacing:.15em;font-weight:800}.ap-mobile-hp{position:absolute!important;left:-9999px!important;opacity:0!important;pointer-events:none!important}
  `;document.head.appendChild(s);
}
function close(){document.querySelector('.ap-mobile-auth')?.remove();pendingPhone='';pendingPurpose='';stage='form';legacySession=false}
function status(text){const el=document.querySelector('.ap-mobile-status');if(el)el.textContent=text||''}
function buttonBusy(btn,busy,label){if(!btn)return;btn.disabled=busy;if(label)btn.textContent=label}
function open(nextMode='login'){
  addStyles();mode=nextMode;stage='form';openedAt=Date.now();render();
}
function base(title,intro,body){
  document.querySelector('.ap-mobile-auth')?.remove();
  const wrap=document.createElement('div');wrap.className='ap-mobile-auth';wrap.innerHTML=`<div class="ap-mobile-sheet" role="dialog" aria-modal="true"><div class="ap-mobile-head"><img src="/Logo1.png" alt="Annapurna Panipuri"><button class="ap-mobile-x" type="button">×</button></div><h2>${title}</h2><p>${intro}</p>${body}<p class="ap-mobile-status"></p></div>`;
  document.body.appendChild(wrap);wrap.querySelector('.ap-mobile-x').onclick=close;wrap.addEventListener('click',e=>{if(e.target===wrap)close()});return wrap;
}
function render(){
  if(stage==='otp')return renderOtp();
  if(stage==='new-password')return renderNewPassword();
  if(mode==='register')return renderRegister();
  if(mode==='reset')return renderReset();
  if(mode==='legacy')return renderLegacy();
  return renderLogin();
}
function renderLogin(){
  const w=base('Welcome back','Log in with the mobile number you verified for your Annapurna account.',`<form class="ap-mobile-form"><input name="mobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="Mobile number" required><input name="password" type="password" autocomplete="current-password" placeholder="Password" minlength="8" required><input class="ap-mobile-hp" name="website" tabindex="-1" autocomplete="off"><button class="ap-mobile-primary" type="submit">Log In</button></form><button class="ap-mobile-link ap-forgot" type="button">Forgot password?</button><button class="ap-mobile-link ap-register" type="button">New here? Create account</button><div class="ap-mobile-note"><b>Older customer?</b> If you originally registered with email and never verified your mobile, activate your old account once so your existing points stay with you.</div><button class="ap-mobile-secondary ap-legacy" type="button">Activate old account</button>`);
  w.querySelector('.ap-register').onclick=()=>open('register');w.querySelector('.ap-forgot').onclick=()=>open('reset');w.querySelector('.ap-legacy').onclick=()=>open('legacy');
  w.querySelector('form').onsubmit=async e=>{e.preventDefault();if(new FormData(e.currentTarget).get('website'))return;const fd=new FormData(e.currentTarget),phone=normalisePhone(fd.get('mobile')),password=String(fd.get('password')||'');if(!validPhone(phone))return status('Enter a valid mobile number.');const btn=e.currentTarget.querySelector('button');buttonBusy(btn,true,'Logging in…');try{const {error}=await supabase.auth.signInWithPassword({phone,password});if(error)throw error;status('✓ Logged in successfully.');setTimeout(close,350)}catch(err){status(friendlyError(err));buttonBusy(btn,false,'Log In')}};
}
function renderRegister(){
  const w=base('Create your rewards account','No email is required. We will verify your mobile number by SMS before the account becomes active.',`<form class="ap-mobile-form"><input name="name" autocomplete="name" placeholder="Full name" maxlength="120" required><input name="mobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="Mobile number" required><input name="password" type="password" autocomplete="new-password" placeholder="Password (minimum 8 characters)" minlength="8" required><input name="confirm" type="password" autocomplete="new-password" placeholder="Confirm password" minlength="8" required><input class="ap-mobile-hp" name="website" tabindex="-1" autocomplete="off"><button class="ap-mobile-primary" type="submit">Create Account & Send OTP</button></form><button class="ap-mobile-link ap-login" type="button">Already a member? Log in</button><div class="ap-mobile-note">Maximum 3 OTP requests per mobile number. After the 3rd OTP, another code cannot be requested for 24 hours. Normal logins never send an SMS.</div>`);
  w.querySelector('.ap-login').onclick=()=>open('login');
  w.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);if(fd.get('website'))return;const phone=normalisePhone(fd.get('mobile')),name=String(fd.get('name')||'').trim(),password=String(fd.get('password')||''),confirm=String(fd.get('confirm')||'');if(Date.now()-openedAt<1000)return status('Please complete the form before continuing.');if(!name)return status('Enter your full name.');if(!validPhone(phone))return status('Enter a valid mobile number.');if(password.length<8)return status('Password must be at least 8 characters.');if(password!==confirm)return status('Passwords do not match.');const guard=smsGuard(phone);if(!guard.ok)return status(guard.message);const btn=e.currentTarget.querySelector('button');buttonBusy(btn,true,'Creating account…');try{const {data,error}=await supabase.auth.signUp({phone,password,options:{data:{full_name:name,mobile_number:phone}}});if(error)throw error;recordSms(phone);pendingPhone=phone;pendingPurpose='register';stage='otp';render();}catch(err){status(friendlyError(err));buttonBusy(btn,false,'Create Account & Send OTP')}};
}
function renderReset(){
  const w=base('Reset password','Enter the mobile number on your account. We will send an OTP; after verification you can choose a new password.',`<form class="ap-mobile-form"><input name="mobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="Mobile number" required><input class="ap-mobile-hp" name="website" tabindex="-1" autocomplete="off"><button class="ap-mobile-primary" type="submit">Send Reset OTP</button></form><button class="ap-mobile-link ap-login" type="button">Back to login</button><div class="ap-mobile-note">Maximum 3 OTP requests per mobile number. After the 3rd OTP, another code cannot be requested for 24 hours.</div>`);
  w.querySelector('.ap-login').onclick=()=>open('login');
  w.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);if(fd.get('website'))return;const phone=normalisePhone(fd.get('mobile'));if(!validPhone(phone))return status('Enter a valid mobile number.');const guard=smsGuard(phone);if(!guard.ok)return status(guard.message);const btn=e.currentTarget.querySelector('button');buttonBusy(btn,true,'Sending OTP…');try{const {error}=await supabase.auth.signInWithOtp({phone,options:{shouldCreateUser:false}});if(error)throw error;recordSms(phone);pendingPhone=phone;pendingPurpose='reset';stage='otp';render();}catch(err){status('If this mobile number belongs to an account, an OTP can be sent after the waiting period. '+friendlyError(err));buttonBusy(btn,false,'Send Reset OTP')}};
}
function renderOtp(){
  const purpose=pendingPurpose==='register'?'Finish registration':pendingPurpose==='legacy'?'Verify your mobile':'Verify reset request';
  const w=base(purpose,`Enter the SMS code sent to ${esc(pendingPhone)}.`,`<form class="ap-mobile-form"><input class="ap-mobile-otp" name="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" maxlength="10" required><button class="ap-mobile-primary" type="submit">Verify OTP</button></form><button class="ap-mobile-secondary ap-resend" type="button">Resend OTP</button><button class="ap-mobile-link ap-back" type="button">Back</button>`);
  w.querySelector('.ap-back').onclick=()=>{stage='form';render()};
  const resend=w.querySelector('.ap-resend');updateResendButton(resend);resend.onclick=()=>resendOtp(resend);
  w.querySelector('form').onsubmit=async e=>{e.preventDefault();const token=String(new FormData(e.currentTarget).get('otp')||'').replace(/\D/g,'');if(token.length<6)return status('Enter the OTP from the SMS.');const btn=e.currentTarget.querySelector('button');buttonBusy(btn,true,'Verifying…');try{const type=pendingPurpose==='legacy'?'phone_change':'sms';const {error}=await supabase.auth.verifyOtp({phone:pendingPhone,token,type});if(error)throw error;if(pendingPurpose==='register'||pendingPurpose==='legacy'){const {error:sErr}=await supabase.rpc('sync_verified_mobile');if(sErr)throw sErr;status('✓ Mobile verified successfully.');setTimeout(close,450);return}stage='new-password';render();}catch(err){status(friendlyError(err));buttonBusy(btn,false,'Verify OTP')}};
}
function updateResendButton(btn){
  const now=Date.now(),lockUntil=getLockUntil(pendingPhone);
  if(lockUntil>now){btn.disabled=true;btn.textContent='3/3 OTPs used • try again in '+formatWait(lockUntil-now);setTimeout(()=>updateResendButton(btn),60_000);return}
  const k='ap-sms-'+safeKey(pendingPhone),times=readTimes(k),last=times[times.length-1]||0,remain=Math.max(0,COOLDOWN_MS-(now-last));if(remain<=0){btn.disabled=false;btn.textContent='Resend OTP';return}btn.disabled=true;btn.textContent='Resend in '+Math.ceil(remain/1000)+'s';setTimeout(()=>updateResendButton(btn),1000);
}
async function resendOtp(btn){
  const guard=smsGuard(pendingPhone);if(!guard.ok)return status(guard.message);buttonBusy(btn,true,'Sending…');try{if(pendingPurpose==='legacy'){const {error}=await supabase.auth.updateUser({phone:pendingPhone});if(error)throw error}else{const {error}=await supabase.auth.signInWithOtp({phone:pendingPhone,options:{shouldCreateUser:false}});if(error)throw error}recordSms(pendingPhone);status('✓ A new OTP was sent.');updateResendButton(btn)}catch(err){status(friendlyError(err));buttonBusy(btn,false,'Resend OTP')}}
function renderNewPassword(){
  const w=base('Choose a new password','Your mobile number is verified. Set a new password for future mobile-number logins.',`<form class="ap-mobile-form"><input name="password" type="password" autocomplete="new-password" placeholder="New password" minlength="8" required><input name="confirm" type="password" autocomplete="new-password" placeholder="Confirm new password" minlength="8" required><button class="ap-mobile-primary" type="submit">Set New Password</button></form>`);
  w.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),password=String(fd.get('password')||''),confirm=String(fd.get('confirm')||'');if(password.length<8)return status('Password must be at least 8 characters.');if(password!==confirm)return status('Passwords do not match.');const btn=e.currentTarget.querySelector('button');buttonBusy(btn,true,'Updating…');try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;await supabase.auth.signOut();status('✓ Password reset successfully. You can now log in with your mobile number.');setTimeout(()=>open('login'),900)}catch(err){status(friendlyError(err));buttonBusy(btn,false,'Set New Password')}};
}
function renderLegacy(){
  const w=base('Activate old account','Use this once only if you previously registered with email and never verified your mobile number. Your existing loyalty points will stay on the same account.',`<form class="ap-mobile-form"><input name="email" type="email" autocomplete="email" placeholder="Old email address" required><input name="password" type="password" autocomplete="current-password" placeholder="Old password" required><input class="ap-mobile-hp" name="website" tabindex="-1" autocomplete="off"><button class="ap-mobile-primary" type="submit">Continue to Mobile Verification</button></form><button class="ap-mobile-link ap-login" type="button">Back to mobile login</button>`);
  w.querySelector('.ap-login').onclick=()=>open('login');
  w.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);if(fd.get('website'))return;const email=String(fd.get('email')||'').trim().toLowerCase(),password=String(fd.get('password')||'');const btn=e.currentTarget.querySelector('button');buttonBusy(btn,true,'Checking account…');try{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;legacySession=true;const {data:profile,error:pErr}=await supabase.from('customer_profiles').select('mobile_number,mobile_verified_at').single();if(pErr)throw pErr;const phone=normalisePhone(profile?.mobile_number);if(!validPhone(phone))throw new Error('No valid mobile number is saved on this old account. Please contact Annapurna staff.');if(profile?.mobile_verified_at){status('This account already has a verified mobile. You can log in using '+phone+'.');return}const guard=smsGuard(phone);if(!guard.ok)throw new Error(guard.message);const {error:uErr}=await supabase.auth.updateUser({phone});if(uErr)throw uErr;recordSms(phone);pendingPhone=phone;pendingPurpose='legacy';stage='otp';render();}catch(err){if(legacySession)await supabase.auth.signOut().catch(()=>{});legacySession=false;status(friendlyError(err));buttonBusy(btn,false,'Continue to Mobile Verification')}};
}

function intercept(event){
  if(event.target.closest?.('.ap-mobile-auth'))return;
  const b=event.target.closest?.('button');if(!b)return;
  const label=(b.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
  let target=null;
  if(label==='log in'||label==='login')target='login';
  else if(label==='create account'||label.includes('new here? create account'))target='register';
  else if(label==='forgot password?')target='reset';
  if(!target)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();open(target);
}
document.addEventListener('click',intercept,true);

const observer=new MutationObserver(()=>{
  document.querySelectorAll('.modal .sheet').forEach(sheet=>{
    if(sheet.closest('.ap-mobile-auth'))return;
    const h=(sheet.querySelector('h2')?.textContent||'').trim().toLowerCase();
    if(!h)return;
    if(h.includes('create your rewards account')||h==='welcome back'||h==='reset password'){
      sheet.closest('.modal')?.remove();
      if(!document.querySelector('.ap-mobile-auth'))open(h.includes('create')?'register':h.includes('reset')?'reset':'login');
    }
  });
});
observer.observe(document.documentElement,{childList:true,subtree:true});

window.AnnapurnaMobileAuth={open};
