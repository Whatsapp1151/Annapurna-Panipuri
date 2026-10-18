import React from 'react';
import {Gift,MapPin,Navigation,Instagram,ChevronRight,Coins,Utensils,User,ReceiptText} from 'lucide-react';
import {LoyaltyProgress} from './customer-experience';
import {BehindScenes} from './behind-scenes';
import './glass-home.css';
const money=n=>'£'+Number(n||0).toFixed(2);
export function GlassHome({session,profile,account,setTab,setAuthMode,menu,orders}){
  const active=orders.filter(o=>!['COMPLETED','CANCELLED'].includes(o.status));
  const first=(profile?.full_name||'Customer').trim().split(/\s+/)[0];
  function browseCategory(name){
    setTab('menu');
    // The menu renders synchronously on the next frame; retry briefly for slower devices.
    let tries=0;
    const jump=()=>{const heading=[...document.querySelectorAll('.nativeMenu .category h2')].find(h=>h.textContent.toLowerCase().includes(name));if(heading){heading.closest('.category').scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}else if(++tries<15)setTimeout(jump,100);};
    setTimeout(jump,80);
  }
  return <div className="glassHome">
    <section className="hero glassHero" aria-labelledby="home-heading">
      <div className="glassHeroCopy"><h1 id="home-heading">{session?<>Welcome,<br/>{first}</>:<>Annapurna<br/>Panipuri</>}</h1>
      <p>Vegetarian Indian street food<br/>in Kenton, Harrow.</p><p className="heroTagline">Order for collection. Earn rewards.</p></div>
      <div className="actions"><button className="primary" onClick={()=>session?setTab('menu'):setAuthMode('register')}>{session?<Utensils size={18}/>:<User size={18}/>} {session?'Order Food':'Register'}<ChevronRight size={18}/></button><button className="secondary" onClick={()=>session?setTab('orders'):setAuthMode('login')}>{session?<><ReceiptText size={18}/>My Orders{active.length?` (${active.length})`:''}</>:'Log in'}</button></div>
    </section>
    <section className="glassReward" aria-labelledby="home-rewards-heading"><div className="glassRound giftRound"><Gift size={28}/></div><div className="glassRewardBody"><h2 id="home-rewards-heading">Your favourites, with something back.</h2><div className="glassRewardRates"><span><Coins size={21}/><strong>£1 = 1 point</strong></span><span><Gift size={21}/><strong>10 points = £0.50</strong></span></div><button className="glassRewardLink" onClick={()=>session?setTab('rewards'):setAuthMode('register')}>Show your loyalty QR at the counter.<ChevronRight size={16}/></button><details className="rewardTerms"><summary>How rewards work</summary><p>Earn whole points on eligible purchases. Redeem with staff in multiples of 10 points. 100 points are worth £5.</p></details></div></section>
    <section className="homeVisit glassVisit"><div className="glassRound"><MapPin size={28}/></div><div><h2>Visit us in Kenton</h2><p>Outside 437 Kenton Road, Harrow<br/><span>HA3 0XY</span></p><div className="glassVisitLinks"><a href="https://www.google.com/maps/search/?api=1&query=437+Kenton+Road+Harrow+HA3+0XY" target="_blank" rel="noopener noreferrer"><Navigation size={20}/>Directions</a><a href="https://www.instagram.com/annapurna_panipuri/" target="_blank" rel="noopener noreferrer"><Instagram size={20}/>Instagram</a></div></div></section>
    {session&&<section className="pointsCard"><small>YOUR POINTS</small><strong>⭐ {account?.points_balance??0} Points</strong><p>Reward Value <b>{money((account?.points_balance??0)*.05)}</b></p><LoyaltyProgress balance={account?.points_balance}/><div className="stats"><div><b>{account?.lifetime_points_earned??0}</b><span>Earned</span></div><div><b>{account?.lifetime_points_redeemed??0}</b><span>Redeemed</span></div></div><button onClick={()=>setTab('history')}>View rewards history <ChevronRight size={18}/></button></section>}
    <section className="glassPicks"><div className="glassSectionTitle"><h2>Popular picks</h2><button onClick={()=>setTab('menu')}>See menu</button></div><div className="glassPickGrid">{[{title:'Panipuri',category:'panipuri',image:'/food-panipuri.webp'},{title:'Momos',category:'momo',image:'/food-momos.webp'}].map(item=><button className="glassPick" key={item.category} onClick={()=>browseCategory(item.category)} aria-label={'Browse '+item.title}><img src={item.image} alt={'Illustrative '+item.title} loading="lazy" width="768" height="512"/><span><strong>{item.title}</strong><ChevronRight size={22}/></span></button>)}</div><small className="foodPhotoNote">Food images are illustrative.</small></section>
    <div className="glassOffersSlot"/>
    <section data-ap-hot-favourites="1"><div className="sectionTitle"><h2>Staff favourites</h2><button onClick={()=>setTab('menu')}>See menu</button></div><div className="popular">{menu.filter(x=>x.available!==false).slice(0,4).map(x=><article key={x.id}><b>{x.name}</b><span>{money(x.price)}</span></article>)}</div></section>
    <BehindScenes onMenu={()=>setTab('menu')}/>
    <details className="homeAbout"><summary>About Annapurna Panipuri & ordering<span>Kenton · Harrow</span></summary><div><p>Vegetarian Indian street food, including panipuri, chaats, momos and dabeli. Order for collection and earn rewards on eligible purchases.</p><p>Within 50m you can order normally. From 51m up to the ordering limit, we verify your mobile again by SMS before accepting the order.</p><address>Outside 437 Kenton Road, Harrow, HA3 0XY</address></div></details>
  </div>;
}
