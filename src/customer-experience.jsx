import React,{useEffect,useRef} from 'react';
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
  const progressRef=useRef(null),previousStatus=useRef(order.status);
  useEffect(()=>{const changed=previousStatus.current!==order.status;previousStatus.current=order.status;
    if(!changed||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const target=progressRef.current?.querySelector('.isCurrent .stepDot')||progressRef.current;
    const animation=target?.animate?.([{opacity:.5,transform:'scale(.92)'},{opacity:1,transform:'scale(1)'}],{duration:280,easing:'ease-out'});
    return ()=>animation?.cancel();
  },[order.status]);
  const current=stages.findIndex(([status])=>status===order.status);
  if(order.status==='CANCELLED')return <div ref={progressRef} className="orderProgress cancelledProgress"><XCircle aria-hidden="true" size={20}/><div><strong>Order cancelled</strong><p>This order will not continue through preparation.</p></div></div>;
  if(current<0)return null;
  const estimate=order.recommended_collection_at||order.promised_ready_at;
  const validEstimate=estimate&&!Number.isNaN(new Date(estimate).getTime());
  return <div ref={progressRef} className="orderProgress">
    <p className="progressMessage" role="status" aria-live="polite" aria-atomic="true">{messages[order.status]}</p>
    <ol aria-label="Order progress">{stages.map(([status,label],index)=><li key={status} className={index<current?'isDone':index===current?'isCurrent':''} aria-current={index===current?'step':undefined}><span className="stepDot" aria-hidden="true">{index<current?<CheckCircle2 size={17}/>:index+1}</span><span>{label}</span><span className="srOnly">{index<current?' — completed':index===current?' — current step':' — upcoming'}</span></li>)}</ol>
    {validEstimate&&current<3&&<p className="collectionEstimate"><Clock aria-hidden="true" size={16}/><span>Estimated collection: <strong>{new Date(estimate).toLocaleString('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</strong> (UK time). Wait for the Ready status before collecting.</span></p>}
  </div>;
}

// Animate feedback without delaying state changes; cancel on interruption/unmount.
export function MotionValue({value,children,className=''}){
  const ref=useRef(null),previous=useRef(value);
  useEffect(()=>{const changed=previous.current!==value;previous.current=value;
    if(!changed||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const animation=ref.current?.animate?.([{transform:'scale(1)'},{transform:'scale(1.07)',offset:.45},{transform:'scale(1)'}],{duration:240,easing:'ease-out'});
    return ()=>animation?.cancel();
  },[value]);
  return <span ref={ref} className={'motionValue '+className}>{children}</span>;
}
export function LoyaltyProgress({balance}){
  if(balance==null)return null;
  const points=Math.max(0,Math.floor(Number(balance)||0));
  const remaining=10-points%10,redeemable=Math.floor(points/10)*10;
  return <div className="loyaltyProgress"><p>{remaining} more point{remaining===1?'':'s'} to {redeemable?'your next':'your first'} £0.50 reward</p><div className="loyaltyTrack" role="progressbar" aria-label="Progress towards the next 10-point reward" aria-valuemin={0} aria-valuemax={10} aria-valuenow={points%10} aria-valuetext={`${remaining} points to the next £0.50 reward`}><span style={{transform:`scaleX(${(points%10)/10})`}}/></div>{redeemable>0&&<small>£{(redeemable*.05).toFixed(2)} available to redeem with staff</small>}</div>;
}
