import {supabase,configured} from './supabase';

let categoryOrder=[];
let busy=false;
let queued=false;

const clean=v=>String(v??'').trim();

async function loadCategoryOrder(force=false){
  if(!configured||busy)return;
  if(categoryOrder.length&&!force)return;
  busy=true;
  try{
    const {data,error}=await supabase
      .from('menu_items')
      .select('category,sort_order,listed')
      .eq('listed',true)
      .order('sort_order',{ascending:true})
      .order('category',{ascending:true});
    if(error)throw error;
    const seen=new Set();
    categoryOrder=[];
    for(const item of data||[]){
      const name=clean(item.category);
      if(name&&!seen.has(name)){seen.add(name);categoryOrder.push(name)}
    }
  }catch(e){
    console.warn('Could not load menu category order',e);
  }finally{busy=false}
}

function menuSection(){
  return [...document.querySelectorAll('section')].find(section=>
    clean(section.querySelector('.eyebrow')?.textContent)==='ORDER & MENU'
  )||null;
}

function categoryName(node){return clean(node.querySelector(':scope > h2')?.textContent)}

function reorderCategories(){
  const section=menuSection();
  if(!section||section.dataset.nativeMenu==='true'||!categoryOrder.length)return;
  const categories=[...section.querySelectorAll(':scope > .category')];
  if(categories.length<2)return;

  const rank=new Map(categoryOrder.map((name,index)=>[name,index]));
  const desired=categories.slice().sort((a,b)=>{
    const ar=rank.has(categoryName(a))?rank.get(categoryName(a)):Number.MAX_SAFE_INTEGER;
    const br=rank.has(categoryName(b))?rank.get(categoryName(b)):Number.MAX_SAFE_INTEGER;
    return ar-br;
  });

  const current=categories.map(categoryName).join('|');
  const next=desired.map(categoryName).join('|');
  if(current===next)return;

  for(const category of desired)section.appendChild(category);
}

async function run(force=false){
  queued=false;
  await loadCategoryOrder(force);
  reorderCategories();
}

function schedule(){
  if(queued)return;
  queued=true;
  setTimeout(()=>void run(false),80);
}

const observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{childList:true,subtree:true});

document.addEventListener('input',e=>{
  if(e.target?.matches?.('.menuSearch'))setTimeout(schedule,40);
},true);
window.addEventListener('focus',()=>void run(true));
supabase?.channel('menu-category-order-fix')
  .on('postgres_changes',{event:'*',schema:'public',table:'menu_items'},()=>void run(true))
  .subscribe();

void run(true);
