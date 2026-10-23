import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';
import {currentWalletProvider} from './wallet-device';
import './loyalty-wallet.css';

export function LoyaltyWallet({session}) {
  const userId=session?.user.id;
  const [provider,setProvider]=useState(currentWalletProvider);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    const media=window.matchMedia('(display-mode: standalone)');
    const update=()=>setProvider(currentWalletProvider());
    media.addEventListener?.('change',update);
    window.addEventListener('pageshow',update);
    return()=>{media.removeEventListener?.('change',update);window.removeEventListener('pageshow',update)};
  },[]);
  useEffect(()=>{
    let cancelled=false;setReady(false);setMessage('');
    if(provider&&userId) supabase.functions.invoke('loyalty-wallet',{body:{action:'status'}}).then(({data,error})=>{
      if(!cancelled&&!error)setReady(data?.[provider]===true);
    }).catch(()=>{});
    return()=>{cancelled=true};
  },[provider,userId]);
  async function save(){
    if(busy)return;setBusy(true);setMessage('');
    try{
      if(!session?.access_token || (session.expires_at && session.expires_at*1000<=Date.now()))throw new Error('Please log in again before adding your loyalty card.');
      if(provider==='apple'){
        // Direct POST lets Safari handle the pkpass MIME type. Never put auth tokens in URLs.
        const form=document.createElement('form');
        form.method='POST';form.action=import.meta.env.VITE_SUPABASE_URL+'/functions/v1/loyalty-wallet';
        form.target='_blank';form.rel='noopener';
        for(const [name,value] of Object.entries({provider:'apple',access_token:session.access_token})){
          const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);
        }
        document.body.append(form);form.submit();form.remove();
        setMessage('Complete the Add step in Apple Wallet. If it does not open, try again.');
      }else{
        const {data,error}=await supabase.functions.invoke('loyalty-wallet',{body:{provider:'google'}});
        if(error||!data?.url)throw new Error('Your wallet card could not be prepared. Please try again.');
        const url=new URL(data.url);
        if(url.origin!=='https://pay.google.com'||!url.pathname.startsWith('/gp/v/save/'))throw new Error('Unable to open Google Wallet.');
        window.location.assign(url.href);
      }
    }catch(e){setMessage(e.message||'Please try again.')}finally{setBusy(false)}
  }
  if(!provider||!ready)return null;
  return <div className="loyaltyWallet"><button type="button" disabled={busy} onClick={save} className="loyaltyWalletButton">{busy?'Preparing your card…':`Add to ${provider==='apple'?'Apple':'Google'} Wallet`}</button><p>Keep your loyalty QR handy when you visit.</p><p role="status" aria-live="polite">{message}</p></div>;
}
