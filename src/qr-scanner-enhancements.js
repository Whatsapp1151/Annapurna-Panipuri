import { Html5Qrcode } from 'html5-qrcode';
import { supabase, configured } from './supabase';

let scanner=null;
let processing=false;
let renderTimer=null;

function toast(message,kind='ok'){
  document.querySelector('.ap-qr-toast')?.remove();
  const el=document.createElement('div');
  el.className='ap-qr-toast '+(kind==='error'?'error':'');
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

function waitFor(fn,timeout=3000){
  return new Promise((resolve,reject)=>{
    const start=Date.now();
    const tick=()=>{
      const value=fn();
      if(value)return resolve(value);
      if(Date.now()-start>timeout)return reject(new Error('The loyalty screen did not open in time.'));
      setTimeout(tick,60);
    };
    tick();
  });
}

function extractToken(decoded){
  const raw=String(decoded||'').trim();
  const token=raw.toLowerCase().startsWith('annapurna:')?raw.slice(raw.indexOf(':')+1).trim():raw;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)?token:null;
}

async function stopScanner(){
  if(!scanner)return;
  try{await scanner.stop()}catch{}
  try{await scanner.clear()}catch{}
  scanner=null;
}

async function closeScanner(){
  await stopScanner();
  document.querySelector('.ap-qr-backdrop')?.remove();
  processing=false;
}

async function selectCustomer(customer){
  await closeScanner();
  const loyaltyButton=[...document.querySelectorAll('.adminTabs button')].find(b=>/loyalty/i.test(b.textContent||''));
  if(!loyaltyButton)throw new Error('Open the Staff dashboard and try scanning again.');
  loyaltyButton.click();

  const input=await waitFor(()=>document.querySelector('.adminBox .search input'));
  const nativeSetter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  if(nativeSetter)nativeSetter.call(input,customer.customer_id);else input.value=customer.customer_id;
  input.dispatchEvent(new Event('input',{bubbles:true}));

  await new Promise(r=>setTimeout(r,80));
  const searchButton=input.closest('.search')?.querySelector('button');
  if(!searchButton)throw new Error('Customer search is not available.');
  searchButton.click();

  const target=await waitFor(()=>{
    const buttons=[...document.querySelectorAll('button.customer')];
    if(!buttons.length)return null;
    return buttons.find(b=>{
      const text=(b.textContent||'').toLowerCase();
      return (customer.email&&text.includes(String(customer.email).toLowerCase()))||
        (customer.mobile_number&&text.includes(String(customer.mobile_number).toLowerCase()))||
        (customer.full_name&&text.includes(String(customer.full_name).toLowerCase()));
    })||buttons[0];
  },3500);
  target.click();
  toast(`✅ ${customer.full_name||'Customer'} selected • ${customer.points_balance??0} points`);
}

async function handleDecoded(decoded){
  if(processing)return;
  processing=true;
  const token=extractToken(decoded);
  if(!token){
    processing=false;
    toast('This is not a valid Annapurna customer QR code.','error');
    return;
  }
  try{
    const {data,error}=await supabase.rpc('staff_lookup_qr',{token});
    if(error)throw error;
    const customer=Array.isArray(data)?data[0]:data;
    if(!customer)throw new Error('Customer not found. Ask the customer to refresh their QR code.');
    await selectCustomer(customer);
  }catch(e){
    processing=false;
    toast(e?.message||'Could not look up this customer.','error');
  }
}

async function startCamera(status){
  try{
    scanner=new Html5Qrcode('ap-qr-reader');
    await scanner.start(
      {facingMode:'environment'},
      {fps:10,qrbox:{width:240,height:240},aspectRatio:1},
      decoded=>handleDecoded(decoded),
      ()=>{}
    );
    status.textContent='Point the camera at the customer’s Annapurna QR code.';
  }catch(e){
    status.textContent='Camera could not start. Allow camera permission in your phone settings, then try again.';
    status.classList.add('error');
  }
}

async function openScanner(){
  if(!configured)return toast('App connection is not ready.','error');
  await closeScanner();
  const wrap=document.createElement('div');
  wrap.className='ap-qr-backdrop';
  wrap.innerHTML=`<div class="ap-qr-sheet">
    <button class="ap-qr-x" type="button" aria-label="Close">×</button>
    <div class="ap-qr-kicker">STAFF LOYALTY</div>
    <h2>Scan customer QR</h2>
    <p>Scan the QR shown in the customer’s <b>My QR</b> tab. Their loyalty account will be selected automatically.</p>
    <div id="ap-qr-reader" class="ap-qr-reader"></div>
    <div class="ap-qr-status">Starting camera…</div>
    <button class="ap-qr-manual" type="button">Use manual customer search</button>
  </div>`;
  document.body.appendChild(wrap);
  const status=wrap.querySelector('.ap-qr-status');
  wrap.querySelector('.ap-qr-x').addEventListener('click',closeScanner);
  wrap.addEventListener('click',e=>{if(e.target===wrap)closeScanner()});
  wrap.querySelector('.ap-qr-manual').addEventListener('click',async()=>{
    await closeScanner();
    const loyaltyButton=[...document.querySelectorAll('.adminTabs button')].find(b=>/loyalty/i.test(b.textContent||''));
    loyaltyButton?.click();
  });
  startCamera(status);
}

function renderScanButton(){
  const tabs=document.querySelector('.adminTabs');
  if(!tabs||tabs.querySelector('[data-qr-scan-button]'))return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.dataset.qrScanButton='1';
  btn.innerHTML='<span class="ap-qr-button-icon">▦</span> Scan QR';
  btn.addEventListener('click',openScanner);
  const loyalty=[...tabs.querySelectorAll('button')].find(b=>/loyalty/i.test(b.textContent||''));
  if(loyalty)loyalty.insertAdjacentElement('afterend',btn);else tabs.appendChild(btn);
}

function scheduleRender(){
  clearTimeout(renderTimer);
  renderTimer=setTimeout(renderScanButton,80);
}

const observer=new MutationObserver(scheduleRender);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',scheduleRender);
scheduleRender();
