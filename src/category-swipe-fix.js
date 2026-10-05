let manualCategorySwipeUntil=0;
let lastAutoButton=null;
let lastAutoAt=0;

const originalScrollIntoView=Element.prototype.scrollIntoView;

function categoryScrollerFor(el){
  const scroller=el?.closest?.('.ap-category-scroll');
  return scroller||null;
}

function markManualSwipe(target,extra=850){
  if(target?.closest?.('.ap-category-scroll'))manualCategorySwipeUntil=Date.now()+extra;
}

document.addEventListener('touchstart',e=>markManualSwipe(e.target,1200),{capture:true,passive:true});
document.addEventListener('touchmove',e=>markManualSwipe(e.target,1200),{capture:true,passive:true});
document.addEventListener('touchend',e=>markManualSwipe(e.target,1300),{capture:true,passive:true});
document.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')markManualSwipe(e.target,1200)},{capture:true,passive:true});
document.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'&&e.buttons)markManualSwipe(e.target,1200)},{capture:true,passive:true});
document.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')markManualSwipe(e.target,1300)},{capture:true,passive:true});

Element.prototype.scrollIntoView=function(options){
  const scroller=categoryScrollerFor(this);
  if(!scroller)return originalScrollIntoView.call(this,options);

  // The menu code asks the active category to scroll into view on every page
  // scroll event. Do not let those automatic requests fight a finger swipe.
  if(Date.now()<manualCategorySwipeUntil)return;

  const sr=scroller.getBoundingClientRect();
  const br=this.getBoundingClientRect();
  const padding=10;
  const fullyVisible=br.left>=sr.left+padding&&br.right<=sr.right-padding;
  if(fullyVisible)return;

  const now=Date.now();
  if(lastAutoButton===this&&now-lastAutoAt<450)return;
  lastAutoButton=this;lastAutoAt=now;

  const targetLeft=scroller.scrollLeft+(br.left-sr.left)-(sr.width-br.width)/2;
  scroller.scrollTo({left:Math.max(0,targetLeft),behavior:'smooth'});
};

// If the category bar is rebuilt while the customer is touching it, keep its
// native momentum scrolling behaviour intact.
const observer=new MutationObserver(()=>{
  document.querySelectorAll('.ap-category-scroll').forEach(scroller=>{
    scroller.style.webkitOverflowScrolling='touch';
  });
});
observer.observe(document.documentElement,{childList:true,subtree:true});
