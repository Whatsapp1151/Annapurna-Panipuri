import {supabase,configured} from './supabase';

let finishing=false;
let checkTimer=null;

function clean(v){return String(v??'').trim()}

function finishRegistration(){
  if(finishing)return;
  const modal=document.querySelector('.ap-mobile-auth');
  if(!modal)return;
  const heading=clean(modal.querySelector('h2')?.textContent).toLowerCase();
  const status=clean(modal.querySelector('.ap-mobile-status')?.textContent).toLowerCase();
  if(!heading.includes('finish registration'))return;
  if(!status.includes('mobile verified successfully'))return;
  finishing=true;
  const statusEl=modal.querySelector('.ap-mobile-status');
  if(statusEl)statusEl.textContent='✓ Registration complete. Opening your account…';
  try{sessionStorage.setItem('ap-registration-finished',String(Date.now()))}catch{}
  setTimeout(()=>{
    const u=new URL(location.href);
    u.searchParams.set('_signup_complete',Date.now().toString());
    location.replace(u.toString());
  },550);
}

const modalObserver=new MutationObserver(finishRegistration);
modalObserver.observe(document.documentElement,{childList:true,subtree:true,characterData:true});

function cleanSignupMarker(){
  const u=new URL(location.href);
  if(!u.searchParams.has('_signup_complete'))return;
  u.searchParams.delete('_signup_complete');
  history.replaceState(null,'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams.toString():'')+u.hash);
  try{sessionStorage.removeItem('ap-registration-finished')}catch{}
}
cleanSignupMarker();

function appIsHealthy(){
  const root=document.getElementById('root');
  return Boolean(root?.querySelector('.app'));
}

function scheduleRecoveryCheck(){
  clearTimeout(checkTimer);
  checkTimer=setTimeout(()=>{
    if(appIsHealthy())return;
    if(document.querySelector('.ap-mobile-auth,.modal,.ap-secure-mobile,.ap-cc-backdrop'))return;
    let last=0;
    try{last=Number(sessionStorage.getItem('ap-auth-white-recovery')||0)}catch{}
    if(Date.now()-last<15000)return;
    try{sessionStorage.setItem('ap-auth-white-recovery',String(Date.now()))}catch{}
    const u=new URL(location.href);
    u.searchParams.set('_auth_recover',Date.now().toString());
    location.replace(u.toString());
  },2200);
}

if(configured&&supabase?.auth){
  supabase.auth.onAuthStateChange((event,session)=>{
    if(session&&['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED','INITIAL_SESSION'].includes(event))scheduleRecoveryCheck();
  });
  setTimeout(async()=>{
    try{const {data:{session}}=await supabase.auth.getSession();if(session)scheduleRecoveryCheck()}catch{}
  },500);
}

setTimeout(()=>{
  const u=new URL(location.href);
  if(u.searchParams.has('_auth_recover')){
    u.searchParams.delete('_auth_recover');
    history.replaceState(null,'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams.toString():'')+u.hash);
  }
},3000);
