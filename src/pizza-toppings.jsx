import React,{useEffect,useRef,useState} from 'react';
import {TOPPINGS,extraToppingPence,displayDishName} from './pizza-options';
import './ordering-options.css';
const money=n=>'£'+Number(n).toFixed(2);
export function ToppingsPicker({item,onAdd,onClose}){
  const [selected,setSelected]=useState([]);const dialog=useRef(null);
  useEffect(()=>{dialog.current.showModal();return()=>dialog.current?.close()},[]);
  const extra=extraToppingPence(selected)/100;
  return <dialog ref={dialog} className="toppingsDialog" aria-labelledby="toppings-title" onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===dialog.current)onClose()}}><div className="toppingsContent"><button type="button" className="toppingsClose" aria-label="Cancel toppings selection" onClick={onClose}>×</button><span className="eyebrow">MAKE IT YOURS</span><h2 id="toppings-title">{displayDishName(item)}</h2><p id="toppings-help">Choose up to <b>5 toppings included</b>. Each extra topping costs <b>£0.60 per pizza</b>.</p><fieldset aria-describedby="toppings-help"><legend>Choose your toppings</legend><div className="toppingsGrid">{TOPPINGS.map(t=><label key={t} className={selected.includes(t)?'chosen':''}><input type="checkbox" checked={selected.includes(t)} onChange={()=>setSelected(s=>s.includes(t)?s.filter(x=>x!==t):[...s,t])}/><span>{t}</span></label>)}</div></fieldset><div className="toppingsSummary" aria-live="polite"><span>{selected.length} selected · {Math.min(selected.length,5)} included</span><b>{extra?`Extra toppings +${money(extra)}`:'No extra charge'}</b></div><button type="button" className="primary" onClick={()=>{onAdd(item,selected);onClose()}}>{selected.length?'Add to basket':'Add without toppings'} · {money(Number(item.price)+extra)}</button></div></dialog>;
}
export function ToppingSummary({toppings,extra=0}){
  if(!Array.isArray(toppings))return null;
  return <small className="toppingDetails">{toppings.length?'Toppings: '+toppings.join(', '):'No extra toppings'}{Number(extra)>0&&` · +${money(extra)} per pizza`}</small>;
}
export function OrderBill({order}){return <div className="orderBill"><div><span>Food subtotal</span><b>{money(order.subtotal||0)}</b></div>{Number(order.discount_amount)>0&&<div><span>Discount</span><b>−{money(order.discount_amount)}</b></div>}<div><span>Takeaway charge</span><b>{money(order.takeaway_charge||0)}</b></div></div>}
