import './commerce-growth.js';
import {supabase,configured} from './supabase';

const SITE_URL='https://annapurna-panipuri.onrender.com/';
const LOGO_URL=SITE_URL+'Logo1.png';
const INSTAGRAM_URL='https://www.instagram.com/annapurna_panipuri/';
const PRIORITY_CATEGORIES=['Panipuri & Chaats','Momos','Dabeli','Pizza Khakhra','Pizza','Sandwiches','Maggie','Indo Chinese','Drinks'];

let seoTimer=null;
let menuTimer=null;
let menuItems=[];
let menuLoaded=false;
let realtimeChannel=null;

const clean=v=>String(v??'').trim();
const absoluteUrl=value=>{
  const v=clean(value);if(!v)return undefined;
  try{return new URL(v,SITE_URL).href}catch{return undefined}
};

function isHomeVisible(){
  const active=[...document.querySelectorAll('nav button.active')].find(Boolean);
  if(active)return /home/i.test(active.textContent||'');
  return Boolean(document.querySelector('.hero'));
}

function isMenuVisible(){
  const active=[...document.querySelectorAll('nav button.active')].find(Boolean);
  return Boolean(active&&/menu/i.test(active.textContent||''));
}

function categories(){
  const live=[...new Set(menuItems.map(i=>clean(i.category)).filter(Boolean))];
  const ordered=PRIORITY_CATEGORIES.filter(c=>live.includes(c));
  return [...ordered,...live.filter(c=>!ordered.includes(c))];
}

function topCategoryText(limit=6){
  const list=categories().slice(0,limit);
  return list.length?list.join(', '):'Panipuri, Chaats, Momos, Dabeli, Pizza Khakhra and Pizza';
}

function description(){
  const cats=topCategoryText(6);
  return `Vegetarian Indian street food in Kenton, Harrow: ${cats} and more. Browse the live Annapurna Panipuri menu, order ahead for collection and earn rewards.`;
}

function setMetaName(name,content){
  let el=document.head.querySelector(`meta[name="${name}"]`);
  if(!el){el=document.createElement('meta');el.setAttribute('name',name);document.head.appendChild(el)}
  if(el.getAttribute('content')!==content)el.setAttribute('content',content);
}

function setMetaProperty(property,content){
  let el=document.head.querySelector(`meta[property="${property}"]`);
  if(!el){el=document.createElement('meta');el.setAttribute('property',property);document.head.appendChild(el)}
  if(el.getAttribute('content')!==content)el.setAttribute('content',content);
}

function applyHeadSeo(){
  const desc=description();
  const title=isMenuVisible()
    ?'Annapurna Panipuri Menu | Indian Street Food in Kenton, Harrow'
    :'Annapurna Panipuri | Indian Street Food in Kenton, Harrow';
  if(document.title!==title)document.title=title;
  setMetaName('description',desc);
  setMetaName('robots','index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
  setMetaProperty('og:title',title);
  setMetaProperty('og:description',desc);
  setMetaProperty('og:url',SITE_URL);
  setMetaProperty('og:image',LOGO_URL);
  setMetaName('twitter:title',title);
  setMetaName('twitter:description',desc);
  setMetaName('twitter:image',LOGO_URL);
}

function menuStructuredData(){
  const grouped=new Map();
  for(const item of menuItems){
    const category=clean(item.category)||'Menu';
    if(!grouped.has(category))grouped.set(category,[]);
    grouped.get(category).push(item);
  }
  const menuSections=[...grouped.entries()].map(([category,items])=>({
    '@type':'MenuSection',
    name:category,
    hasMenuItem:items.map(item=>{
      const node={
        '@type':'MenuItem',
        name:clean(item.name)||'Menu item',
        offers:{
          '@type':'Offer',
          price:Number(item.price||0).toFixed(2),
          priceCurrency:'GBP',
          availability:item.available===false?'https://schema.org/SoldOut':'https://schema.org/InStock'
        }
      };
      if(clean(item.description))node.description=clean(item.description);
      const image=absoluteUrl(item.image_url);if(image)node.image=image;
      if(item.vegetarian!==false)node.suitableForDiet='https://schema.org/VegetarianDiet';
      return node;
    })
  }));

  return {
    '@context':'https://schema.org',
    '@graph':[
      {
        '@type':'Restaurant',
        '@id':SITE_URL+'#restaurant',
        name:'Annapurna Panipuri',
        url:SITE_URL,
        image:LOGO_URL,
        logo:LOGO_URL,
        priceRange:'£',
        servesCuisine:['Indian','Gujarati','Indian Street Food','Vegetarian'],
        sameAs:[INSTAGRAM_URL],
        hasMenu:{'@id':SITE_URL+'#menu'},
        potentialAction:{
          '@type':'OrderAction',
          target:SITE_URL,
          deliveryMethod:'https://purl.org/goodrelations/v1#DeliveryModePickUp'
        }
      },
      {
        '@type':'Menu',
        '@id':SITE_URL+'#menu',
        name:'Annapurna Panipuri Menu',
        url:SITE_URL,
        hasMenuSection:menuSections
      }
    ]
  };
}

function applyStructuredData(){
  if(!menuLoaded||!menuItems.length)return;
  let script=document.getElementById('ap-auto-seo-jsonld');
  if(!script){script=document.createElement('script');script.type='application/ld+json';script.id='ap-auto-seo-jsonld';document.head.appendChild(script)}
  const next=JSON.stringify(menuStructuredData());
  if(script.textContent!==next)script.textContent=next;
}

function renderLocalSeo(){
  const existing=document.querySelector('.ap-local-seo');
  if(!isHomeVisible()){
    existing?.remove();
    return;
  }
  const main=document.querySelector('main');if(!main)return;
  const cats=categories().slice(0,8);
  const count=menuItems.length;
  const signature=[cats.join('|'),count].join('::');
  let section=existing;
  if(section?.dataset.signature===signature)return;
  if(!section){section=document.createElement('section');section.className='ap-local-seo';section.setAttribute('aria-label','About Annapurna Panipuri in Kenton, Harrow')}
  section.dataset.signature=signature;
  section.innerHTML=`
    <span class="ap-seo-kicker">KENTON • HARROW</span>
    <h2>Vegetarian Indian street food in Kenton, Harrow</h2>
    <p>Annapurna Panipuri serves ${count?`${count} listed menu items across ${categories().length} categories`:'a wide range of vegetarian Indian street food'}, including ${topCategoryText(6)} and more. Order ahead for collection and earn loyalty rewards on qualifying purchases.</p>
    <address>Outside 437 Kenton Road, Harrow, London, HA3 0XY</address>
    <div class="ap-seo-tags" aria-label="Live menu categories">
      ${(cats.length?cats:PRIORITY_CATEGORIES.slice(0,6)).map(c=>`<span>${escapeHtml(c)}</span>`).join('')}
    </div>`;
  if(!section.isConnected)main.appendChild(section);
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function applySeo(){
  applyHeadSeo();
  applyStructuredData();
  renderLocalSeo();
}

function scheduleSeo(){
  clearTimeout(seoTimer);
  seoTimer=setTimeout(applySeo,120);
}

async function loadMenuSeo(){
  if(!configured)return;
  try{
    const {data,error}=await supabase
      .from('menu_items')
      .select('id,name,description,price,category,image_url,available,vegetarian,listed,updated_at')
      .eq('listed',true)
      .order('sort_order',{ascending:true});
    if(error)throw error;
    menuItems=data||[];
    menuLoaded=true;
    applySeo();
  }catch(err){
    console.warn('Auto SEO menu refresh skipped',err);
    applySeo();
  }
}

function scheduleMenuRefresh(){
  clearTimeout(menuTimer);
  menuTimer=setTimeout(()=>void loadMenuSeo(),700);
}

function subscribeMenuSeo(){
  if(!configured||realtimeChannel)return;
  realtimeChannel=supabase
    .channel('auto-seo-menu')
    .on('postgres_changes',{event:'*',schema:'public',table:'menu_items'},scheduleMenuRefresh)
    .subscribe();
}

const observer=new MutationObserver(scheduleSeo);
observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
window.addEventListener('focus',()=>{scheduleSeo();scheduleMenuRefresh()});

subscribeMenuSeo();
void loadMenuSeo();
scheduleSeo();
