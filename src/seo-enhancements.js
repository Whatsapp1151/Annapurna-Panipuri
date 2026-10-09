import './commerce-growth.js';
import {supabase} from './supabase';

let seoTimer=null;

function isHomeVisible(){
  const active=[...document.querySelectorAll('nav button.active')].find(Boolean);
  if(active)return /home/i.test(active.textContent||'');
  return Boolean(document.querySelector('.hero'));
}

function renderLocalSeo(){
  const existing=document.querySelector('.ap-local-seo');
  if(!isHomeVisible()){
    existing?.remove();
    return;
  }
  if(existing)return;
  const main=document.querySelector('main');
  if(!main)return;
  const section=document.createElement('section');
  section.className='ap-local-seo';
  section.setAttribute('aria-label','About Annapurna Panipuri in Kenton, Harrow');
  section.innerHTML=`
    <span class="ap-seo-kicker">KENTON • HARROW</span>
    <h2>Indian street food in Kenton, Harrow</h2>
    <p>Annapurna Panipuri serves vegetarian Indian street food including panipuri &amp; chaats, momos, dabeli, pizza khakhra, sandwiches, Maggi, Indo-Chinese dishes, drinks and more. Order ahead for collection and earn loyalty rewards on qualifying purchases.</p>
    <address>Outside 437 Kenton Road, Harrow, London, United Kingdom</address>
    <div class="ap-seo-tags" aria-label="Popular menu categories">
      <span>Panipuri &amp; Chaats</span><span>Momos</span><span>Dabeli</span><span>Pizza Khakhra</span><span>Indo-Chinese</span><span>Vegetarian</span>
    </div>`;
  main.appendChild(section);
}

function scheduleSeo(){
  clearTimeout(seoTimer);
  seoTimer=setTimeout(renderLocalSeo,120);
}

// commerce-growth.js checks the role when it starts. If a staff/admin signs in
// after the page originally opened logged-out, reload once so the staff-only
// growth controls initialise with the authenticated role.
supabase.auth.onAuthStateChange(async(event,session)=>{
  if(event!=='SIGNED_IN'||!session?.user?.id)return;
  try{
    const {data}=await supabase.from('user_roles').select('role').eq('auth_user_id',session.user.id).maybeSingle();
    if(!['STAFF','ADMIN'].includes(data?.role))return;
    const key='ap-growth-staff-init-'+session.user.id;
    if(sessionStorage.getItem(key))return;
    sessionStorage.setItem(key,'1');
    setTimeout(()=>location.reload(),150);
  }catch{}
});

const observer=new MutationObserver(scheduleSeo);
observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
window.addEventListener('focus',scheduleSeo);
scheduleSeo();
