(()=>{
  const LOGO='/Logo1.png?v=20261006-2';
  function applyLogo(){
    const img=document.querySelector('header img');
    if(!img)return false;
    if(img.getAttribute('src')!==LOGO) img.setAttribute('src',LOGO);
    img.setAttribute('alt','Annapurna Panipuri');
    img.style.display='block';
    img.style.width='50px';
    img.style.height='50px';
    img.style.objectFit='contain';
    img.style.flex='0 0 50px';
    return true;
  }
  function retry(){
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      if(applyLogo()||tries>=50)clearInterval(timer);
    },100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',retry,{once:true});
  else retry();
  window.addEventListener('pageshow',()=>setTimeout(applyLogo,50));
})();
