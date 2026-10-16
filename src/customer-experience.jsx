import React from 'react';
import {Gift,CheckCircle2,Clock, XCircle} from 'lucide-react';
import './customer-experience.css';

export function LoyaltyBenefits({session,onRegister,onShowQR}){
  return <section className="loyaltyBenefits" aria-labelledby="loyalty-benefits-title">
    <div className="benefitHeading"><Gift aria-hidden="true" size={24}/><div><span className="benefitKicker">ANNAPURNA REWARDS</span><h2 id="loyalty-benefits-title">Your favourites, with something back.</h2></div></div>
    <div className="benefitGrid"><div><strong>£1 = 1 point</strong><span>Earn whole points on eligible purchases.</span></div><div><strong>10 points = £0.50</strong><span>Save points and redeem with staff.</span></div></div>
    <p>100 points are worth £5. Redeem in multiples of 10. Show your loyalty QR when ordering at the counter.</p>
    {(session?onShowQR:onRegister)&&<button type="button" className="benefitAction" onClick={session?onShowQR:onRegister}>{session?'Show my loyalty QR':'Register for rewards'}</button>}
  </section>;
}

const stages=[['NEW','Received'],['ACCEPTED','Accepted'],['PREPARING','Preparing'],['READY','Ready'],['COMPLETED','Completed']];
const messages={NEW:'Your order has reached the shop. Waiting for staff to accept it.',ACCEPTED:'The shop has accepted your order.',PREPARING:'Your food is being prepared.',READY:'Your food is ready. Please collect it from the counter.',COMPLETED:'This order is complete.'};
export function OrderProgress({order}){
  const current=stages.findIndex(([status])=>status===order.status);
  if(order.status==='CANCELLED')return <div className="orderProgress cancelledProgress"><XCircle aria-hidden="true" size={20}/><div><strong>Order cancelled</strong><p>This order will not continue through preparation.</p></div></div>;
  if(current<0)return null;
  const estimate=order.recommended_collection_at||order.promised_ready_at;
  const validEstimate=estimate&&!Number.isNaN(new Date(estimate).getTime());
  return <div className="orderProgress">
    <p className="progressMessage" role="status" aria-live="polite" aria-atomic="true">{messages[order.status]}</p>
    <ol aria-label="Order progress">{stages.map(([status,label],index)=><li key={status} className={index<current?'isDone':index===current?'isCurrent':''} aria-current={index===current?'step':undefined}><span className="stepDot" aria-hidden="true">{index<current?<CheckCircle2 size={17}/>:index+1}</span><span>{label}</span><span className="srOnly">{index<current?' — completed':index===current?' — current step':' — upcoming'}</span></li>)}</ol>
    {validEstimate&&current<3&&<p className="collectionEstimate"><Clock aria-hidden="true" size={16}/><span>Estimated collection: <strong>{new Date(estimate).toLocaleString('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</strong> (UK time). Wait for the Ready status before collecting.</span></p>}
  </div>;
}
