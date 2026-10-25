import React,{useEffect,useState} from 'react';
import {supabase,configured} from './supabase';
import './ordering-options.css';
let cached=null,pending=null;
const subscribers=new Set();
function publish(value){cached=value;for(const fn of subscribers)fn(value)}
export async function refreshOrderingStatus(){
  if(!configured)return null;
  if(pending)return pending;
  pending=(async()=>{try{const {data,error}=await supabase.rpc('shop_ordering_status');if(error)throw error;publish(data);return data}catch{publish(null);return null}finally{pending=null}})();
  return pending;
}
export function useShopStatus(){
 const [status,setStatus]=useState(cached);
 useEffect(()=>{subscribers.add(setStatus);setStatus(cached);return()=>subscribers.delete(setStatus)},[]);
 return status;
}
export function openingLabel(status){
 return status?.next_open_at?new Date(status.next_open_at).toLocaleString('en-GB',{timeZone:status.timezone||'Europe/London',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:true}):'our next opening time';
}
export function ShopNotice(){
 const status=useShopStatus();
 if(status?.is_open)return null;
 return <div className="shopStatusNotice" role="status"><b>{!status?'Checking ordering availability…':status.closed_early?'Restaurant closed early today':'Online ordering is closed'}</b><span>{!status?'Please check your connection if this message stays visible.':status.next_open_at?`You can still browse the menu. Ordering reopens ${openingLabel(status)}.`:'You can still browse the menu. Please check back for ordering availability.'}</span></div>;
}
export function RestaurantControl(){
 const status=useShopStatus();const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function toggle(){
   if(!status||busy)return;
   const closed=!status.closed_early;
   if(closed&&!window.confirm('Close ordering for the rest of today? Existing orders still need to be completed or cancelled. Ordering will reopen automatically at the next scheduled opening.'))return;
   setBusy(true);setError('');
   try{const {data,error}=await supabase.rpc('set_shop_closed_early',{close_early:closed});if(error)throw error;publish(data)}catch(e){setError(e.message||'Could not change ordering. Please try again.')}finally{setBusy(false)}
 }
 return <div className="restaurantControl"><div><b>{status?.closed_early?'Closed early for today':status?.is_open?'Restaurant ordering is open':'Restaurant ordering is closed'}</b><p>{status?.closed_early?`Automatically reopens ${openingLabel(status)}.`:`Daily hours: ${status?.opens_at||'10:00'}–${status?.closes_at||'22:00'} (London time).`}</p><small>Existing orders are not cancelled by closing early.</small></div><button type="button" disabled={!status||busy} onClick={toggle}>{busy?'Saving…':status?.closed_early?'Undo early closure':'Close early today'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
if(configured){
 void refreshOrderingStatus();
 setInterval(()=>{if(!document.hidden)void refreshOrderingStatus()},15000);
 window.addEventListener('focus',()=>void refreshOrderingStatus());
 window.addEventListener('online',()=>void refreshOrderingStatus());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshOrderingStatus()});
 // Polling remains the fallback if Realtime is unavailable for this table.
 supabase.channel('restaurant-ordering-status').on('postgres_changes',{event:'UPDATE',schema:'public',table:'order_settings'},()=>void refreshOrderingStatus()).subscribe();
}
