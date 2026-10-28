import React,{useEffect,useRef,useState} from 'react';
import {Download,X} from 'lucide-react';
import './install-app.css';

export function InstallApp(){
  const [installed,setInstalled]=useState(false),[busy,setBusy]=useState(false),[guide,setGuide]=useState(false);
  const dialog=useRef(null);
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const android=/Android/i.test(navigator.userAgent);
  useEffect(()=>{
    const media=window.matchMedia('(display-mode: standalone)');
    const update=()=>setInstalled(media.matches||navigator.standalone===true||!!window.AnnapurnaInstall?.installed);
    update();media.addEventListener('change',update);window.addEventListener('annapurna:install-state',update);
    return()=>{media.removeEventListener('change',update);window.removeEventListener('annapurna:install-state',update)};
  },[]);
  useEffect(()=>{if(guide&&!installed)dialog.current?.showModal();},[guide,installed]);
  async function install(){
    if(busy)return;
    if(!window.AnnapurnaInstall?.available()){setGuide(true);return;}
    setBusy(true);
    try{const outcome=await window.AnnapurnaInstall.prompt();if(outcome==='accepted')setInstalled(true);else if(!outcome)setGuide(true)}
    catch{setGuide(true)}finally{setBusy(false)}
  }
  if(installed)return null;
  return <>
    <div className="ap-install-row"><div><strong>Keep Annapurna on your phone</strong><small>Quick access to your menu, QR and rewards</small></div><button onClick={install} disabled={busy}><Download size={17} aria-hidden="true"/>{busy?'Opening…':'Install app'}</button></div>
    {guide&&<dialog ref={dialog} className="ap-install-dialog" aria-labelledby="ap-install-title" onCancel={()=>setGuide(false)} onClick={e=>{if(e.target===e.currentTarget)setGuide(false)}}>
      <button className="ap-install-close" aria-label="Close installation instructions" onClick={()=>setGuide(false)}><X size={22}/></button>
      <img src="/Logo1.png" width="64" height="64" alt=""/>
      <h2 id="ap-install-title">Add Annapurna to your home screen</h2>
      <p>Your menu and loyalty QR, one tap away.</p>
      {ios?<ol><li>Tap your browser’s <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Keep <b>Open as Web App</b> on if shown, then tap <b>Add</b>.</li></ol>:android?<ol><li>Open your browser’s <b>⋮ menu</b>.</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Confirm <b>Install</b> or <b>Add</b>.</li></ol>:<ol><li>Look for the install icon in the address bar, or open your browser’s menu.</li><li>Choose <b>Install app</b>, if available, and confirm.</li></ol>}
      <p className="ap-install-help">{ios?'Option missing? Open this website in Safari and use Share.':android?'Option missing? Open this website in Chrome outside Instagram or Facebook.':'If installation is unavailable, bookmark this website instead.'} You can also keep using the website without installing.</p>
      <button className="ap-install-done" onClick={()=>setGuide(false)}>Got it</button>
    </dialog>}
  </>;
}
