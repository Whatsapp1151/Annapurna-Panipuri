import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import QRCode from 'qrcode';
import {Home,Utensils,Gift,History,User,LogOut,ShieldCheck,QrCode,Search,PlusCircle,MinusCircle,ChevronRight,Pencil,Save,X,Settings,ReceiptText,ShoppingCart,MapPin,BellRing,Store,CheckCircle2,PackageCheck,LocateFixed,RefreshCw,Phone,KeyRound} from 'lucide-react';
import {supabase,configured} from './supabase';
import './styles.css';

const VAPID_PUBLIC='BJ5eiwgyuYlBUNKLBKQWOSuQhWX0iysmNE2lhcZv997LOF0R8Lfy0f2ffWeS6r3iVzSDdYL9Ze63RUSRsM8kevM';
const money=n=>'£'+Number(n||0).toFixed(2);
const first=n=>(n||'Customer').trim().split(/\s+/)[0];
let audioCtx=null;

function normalisePhone(value){
  let v=String(value||'').trim().replace(/[ ()-]/g,'');
  if(v.startsWith('00'))v='+'+v.slice(2);
  if(/^07\d{9}$/.test(v))v='+44'+v.slice(1);
  if(/^44\d{10}$/.test(v))v='+'+v;
  return v;
}
function validPhone(v){return /^\+[1-9]\d{7,14}$/.test(normalisePhone(v))}
function friendlySmsError(e){
  const m=String(e?.message||e||'');
  if(/sms|phone|provider|unsupported/i.test(m)) return 'SMS OTP is not configured yet. Annapurna needs an SMS provider connected in Supabase before mobile verification can send codes.';
  return m||'Could not send the SMS code.';
}
function b64ToU8(s){const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...b].map(c=>c.charCodeAt(0)))}
async function unlockAudio(){try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')await audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();g.gain.value=.03;o.frequency.value=650;o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.08);return true}catch{return false}}
function ringAlarm(kind='order'){if(!audioCtx||audioCtx.state!=='running')return;const start=audioCtx.currentTime,freq=kind==='ready'?980:720;for(let i=0;i<8;i++){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='square';o.frequency.value=freq+(i%2?180:0);g.gain.setValueAtTime(.001,start+i*.24);g.gain.exponentialRampToValueAtTime(.35,start+i*.24+.02);g.gain.exponentialRampToValueAtTime(.001,start+i*.24+.16);o.connect(g);g.connect(audioCtx.destination);o.start(start+i*.24);o.stop(start+i*.24+.18)}if(navigator.vibrate)navigator.vibrate([350,120,350,120,700])}
async function localNotify(title,body){try{if(!('Notification'in window)||Notification.permission!=='granted')return;const reg=await navigator.serviceWorker.ready;await reg.showNotification(title,{body,icon:'/logo.svg',badge:'/logo.svg',vibrate:[300,100,300,100,700],data:{url:'/?orders=1'}})}catch{}}
async function enableAlerts(session,setNotice){
  await unlockAudio();
  if(!session){setNotice('Please log in first.');return false}
  const compat=window.AnnapurnaNotificationSupport;
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){
    setNotice(compat?.isIOS&&!compat?.isStandalone?'Live alerts work while this page is open. On iPhone/iPad, add Annapurna to the Home Screen, open it from the icon and enable notifications there.':'Live in-app alerts are enabled. Install the PWA to the Home Screen for the best background notification support.');return true
  }
  try{
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){setNotice('Live in-app alerts are enabled, but notification permission was not allowed.');return true}
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToU8(VAPID_PUBLIC)});
    const j=sub.toJSON();
    const {error}=await supabase.from('push_subscriptions').upsert({auth_user_id:session.user.id,endpoint:j.endpoint,p256dh:j.keys?.p256dh,auth:j.keys?.auth},{onConflict:'endpoint'});
    if(error)throw error;
    localStorage.setItem('annapurnaAlerts','1');
    setNotice('🔔 Notifications enabled. Keep your notification sound and device volume on.');
    return true
  }catch(e){setNotice('Live in-app alerts are enabled. Background notification setup could not finish: '+(e?.message||'unsupported'));return true}
}

function App(){
  const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[account,setAccount]=useState(null),[tx,setTx]=useState([]),[menu,setMenu]=useState([]),[tab,setTab]=useState('home'),[authMode,setAuthMode]=useState(null),[notice,setNotice]=useState(''),[qr,setQr]=useState(''),[role,setRole]=useState('CUSTOMER'),[cart,setCart]=useState([]),[orders,setOrders]=useState([]),[orderPulse,setOrderPulse]=useState(0),[phoneVerify,setPhoneVerify]=useState(false),[refreshing,setRefreshing]=useState(false);

  useEffect(()=>{
    if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
    if(!configured)return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{setSession(s);if(event==='PASSWORD_RECOVERY')setAuthMode('change-password')});
    return()=>subscription.unsubscribe()
  },[]);
  useEffect(()=>{loadMenu();if(session?.user)loadPrivate();else{setProfile(null);setAccount(null);setTx([]);setRole('CUSTOMER');setQr('');setOrders([])}},[session]);

  async function hardRefresh(){
    setRefreshing(true);
    try{
      if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.update().catch(()=>{})))}
      if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('annapurna-')).map(k=>caches.delete(k)))}
    }catch{}
    const u=new URL(location.href);u.searchParams.set('_refresh',Date.now().toString());location.replace(u.toString());
  }
  async function loadMenu(){if(!configured)return;const {data,error}=await supabase.from('menu_items').select('*').order('category').order('sort_order');if(!error&&data)setMenu(data)}
  async function loadOrdersFor(p=profile){if(!p)return;const {data}=await supabase.from('orders').select('*,order_items(*)').eq('customer_id',p.customer_id).order('created_at',{ascending:false}).limit(30);setOrders(data||[])}
  async function loadPrivate(){
    const uid=session.user.id;
    const [{data:p},{data:r}]=await Promise.all([supabase.from('customer_profiles').select('*').eq('auth_user_id',uid).single(),supabase.from('user_roles').select('role').eq('auth_user_id',uid).single()]);
    setProfile(p||null);setRole(r?.role||'CUSTOMER');
    if(p){const [{data:a},{data:t}]=await Promise.all([supabase.from('loyalty_accounts').select('*').eq('customer_id',p.customer_id).single(),supabase.from('loyalty_transactions').select('*').eq('customer_id',p.customer_id).order('created_at',{ascending:false})]);setAccount(a||null);setTx(t||[]);loadOrdersFor(p);if(p.qr_token)QRCode.toDataURL('annapurna:'+p.qr_token,{width:360,margin:2}).then(setQr)}
  }
  const isStaff=['STAFF','ADMIN'].includes(role);
  useEffect(()=>{if(!profile||!session)return;const channel=supabase.channel('customer-orders-'+profile.customer_id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders',filter:'customer_id=eq.'+profile.customer_id},payload=>{loadOrdersFor(profile);if(payload.new?.status==='READY'&&payload.old?.status!=='READY'){ringAlarm('ready');localNotify('Your order is ready!','Order #'+payload.new.order_number+' is ready to collect.');setNotice('🔔 Your order #'+payload.new.order_number+' is READY to collect!')}}).subscribe();return()=>supabase.removeChannel(channel)},[profile?.customer_id,session?.user?.id]);
  useEffect(()=>{if(!isStaff||!session)return;const channel=supabase.channel('staff-new-orders').on('postgres_changes',{event:'INSERT',schema:'public',table:'orders'},payload=>{ringAlarm('order');localNotify('New Annapurna order','Order #'+payload.new.order_number+' has arrived.');setNotice('🔔 NEW ORDER #'+payload.new.order_number);setOrderPulse(Date.now())}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders'},()=>setOrderPulse(Date.now())).subscribe();return()=>supabase.removeChannel(channel)},[isStaff,session?.user?.id]);

  function addToCart(item){setCart(c=>{const old=c.find(x=>x.id===item.id);return old?c.map(x=>x.id===item.id?{...x,quantity:x.quantity+1}:x):[...c,{id:item.id,name:item.name,price:Number(item.price),quantity:1}]})}
  function changeQty(id,delta){setCart(c=>c.map(x=>x.id===id?{...x,quantity:x.quantity+delta}:x).filter(x=>x.quantity>0))}
  async function signOut(){await supabase.auth.signOut();setTab('home')}
  const cartCount=cart.reduce((n,x)=>n+x.quantity,0),cartTotal=cart.reduce((n,x)=>n+x.price*x.quantity,0);
  const gated=!session&&['rewards','history','account','orders','checkout'].includes(tab);

  return <div className="app">
    <header>
      <img src="/logo.svg" alt="Annapurna Panipuri"/>
      <div className="brand"><b>Annapurna Panipuri</b><small>Fresh street food • Rewards • Order ahead</small></div>
      <button className={'refreshBtn '+(refreshing?'spinning':'')} onClick={hardRefresh} aria-label="Refresh app" title="Refresh app"><RefreshCw size={19}/></button>
      {isStaff&&<button className="staffPill" onClick={()=>setTab('admin')}><ShieldCheck size={16}/>Staff</button>}
    </header>
    <main>
      {notice&&<div className="notice" onClick={()=>setNotice('')}>{notice}</div>}
      {session&&profile&&role==='CUSTOMER'&&!profile.mobile_verified_at&&<div className="verifyBanner"><Phone size={20}/><div><b>Verify your mobile number</b><span>Mobile verification is required for customer ordering.</span></div><button onClick={()=>setPhoneVerify(true)}>Verify</button></div>}
      {tab==='home'&&<HomePage session={session} profile={profile} account={account} setTab={setTab} setAuthMode={setAuthMode} menu={menu.filter(x=>x.available)} orders={orders}/>} 
      {tab==='menu'&&<Menu menu={menu.filter(x=>x.available)} cart={cart} addToCart={addToCart} changeQty={changeQty}/>} 
      {gated&&<Join setAuthMode={setAuthMode}/>} 
      {!gated&&tab==='checkout'&&<Checkout cart={cart} total={cartTotal} session={session} profile={profile} setNotice={setNotice} clearCart={()=>setCart([])} setTab={setTab} refresh={()=>loadOrdersFor(profile)} onVerifyMobile={()=>setPhoneVerify(true)}/>} 
      {!gated&&tab==='orders'&&<MyOrders orders={orders} session={session} setNotice={setNotice}/>} 
      {!gated&&tab==='rewards'&&<Rewards account={account} qr={qr}/>} 
      {!gated&&tab==='history'&&<HistoryPage tx={tx}/>} 
      {!gated&&tab==='account'&&<Account profile={profile} refresh={loadPrivate} signOut={signOut} setNotice={setNotice} setAuthMode={setAuthMode} setTab={setTab} onVerifyMobile={()=>setPhoneVerify(true)}/>} 
      {tab==='admin'&&isStaff&&<Admin setNotice={setNotice} refreshMenu={loadMenu} orderPulse={orderPulse} session={session}/>} 
    </main>
    {cartCount>0&&tab!=='checkout'&&<button className="cartFloat" onClick={()=>setTab('checkout')}><ShoppingCart size={20}/><span>{cartCount} item{cartCount!==1?'s':''}</span><b>{money(cartTotal)}</b></button>}
    <nav>{[['home',Home,'Home'],['menu',Utensils,'Menu'],['rewards',QrCode,'My QR'],['history',History,'History'],['account',User,'Account']].map(([k,I,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}><I size={21}/><span>{l}</span></button>)}</nav>
    {authMode&&<Auth mode={authMode} close={()=>setAuthMode(null)} setNotice={setNotice} onRegistered={loadPrivate}/>} 
    {phoneVerify&&profile&&<PhoneVerification profile={profile} close={()=>setPhoneVerify(false)} setNotice={setNotice} onDone={async()=>{setPhoneVerify(false);await loadPrivate()}}/>}
  </div>
}

function HomePage({session,profile,account,setTab,setAuthMode,menu,orders}){const active=orders.filter(o=>!['COMPLETED','CANCELLED'].includes(o.status));return <><section className="hero"><span className="eyebrow">ANNAPURNA PANIPURI</span><h1>{session?'Welcome, '+first(profile?.full_name)+' 👋':'Street food, rewarded.'}</h1><p>{session?'Order ahead when you are nearby, pay at collection, and keep earning rewards.':'Browse the full menu. Join rewards and order ahead when you are near the shop.'}</p><div className="actions"><button className="primary" onClick={()=>setTab('menu')}><Utensils size={18}/>Order Food</button>{session?<button className="secondary" onClick={()=>setTab('orders')}><ReceiptText size={18}/>My Orders {active.length?`(${active.length})`:''}</button>:<button className="secondary" onClick={()=>setAuthMode('login')}>Log in</button>}</div></section>{session&&<section className="pointsCard"><small>YOUR POINTS</small><strong>⭐ {account?.points_balance??0} Points</strong><p>Reward Value <b>{money((account?.points_balance??0)*.05)}</b></p><div className="stats"><div><b>{account?.lifetime_points_earned??0}</b><span>Earned</span></div><div><b>{account?.lifetime_points_redeemed??0}</b><span>Redeemed</span></div></div><button onClick={()=>setTab('history')}>View rewards history <ChevronRight size={18}/></button></section>}<section><div className="sectionTitle"><h2>Popular picks</h2><button onClick={()=>setTab('menu')}>See menu</button></div><div className="popular">{menu.slice(0,4).map(x=><article key={x.id}><div className="foodIcon">🥣</div><b>{x.name}</b><span>{Number(x.price)===0?'FREE':money(x.price)}</span></article>)}</div></section><section className="rule"><MapPin/><div><b>Nearby ordering</b><p>Within 50m you can order normally. From 51m up to the ordering limit, we verify your mobile again by SMS before accepting the order.</p></div></section></>}

function Menu({menu,cart,addToCart,changeQty}){const [search,setSearch]=useState('');const filtered=menu.filter(x=>x.name.toLowerCase().includes(search.toLowerCase())||x.category.toLowerCase().includes(search.toLowerCase()));const groups=useMemo(()=>Object.entries(filtered.reduce((a,m)=>((a[m.category]??=[]).push(m),a),{})),[filtered]);return <section><div className="pageHead"><span className="eyebrow">ORDER & MENU</span><h1>Choose your favourites.</h1><p>Add items to your basket. You will pay when you collect.</p></div><input className="menuSearch" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search menu..."/>{groups.map(([cat,items])=><div className="category" key={cat}><h2>{cat}</h2>{items.map(x=>{const ci=cart.find(c=>c.id===x.id);return <div className="menuRow orderMenuRow" key={x.id}><div><b>{x.name}</b><small>{x.vegetarian?'● Vegetarian':''}</small></div><strong>{Number(x.price)===0?'FREE':money(x.price)}</strong>{ci?<div className="qty"><button onClick={()=>changeQty(x.id,-1)}>−</button><span>{ci.quantity}</span><button onClick={()=>changeQty(x.id,1)}>+</button></div>:<button className="addBtn" onClick={()=>addToCart(x)}>Add</button>}</div>})}</div>)}</section>}

function Checkout({cart,total,session,profile,setNotice,clearCart,setTab,refresh,onVerifyMobile}){
  const [fulfilment,setFulfilment]=useState(''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[otpStep,setOtpStep]=useState(false),[otp,setOtp]=useState(''),[pendingPos,setPendingPos]=useState(null),[distance,setDistance]=useState(null);
  async function create(pos,token=null){
    const {data,error}=await supabase.rpc('create_order',{fulfilment_text:fulfilment,customer_latitude:pos.coords.latitude,customer_longitude:pos.coords.longitude,cart_items:cart.map(x=>({menu_item_id:x.id,quantity:x.quantity})),order_notes:notes,phone_verification_token:token});
    if(error)throw error;
    enableAlerts(session,()=>{});const push=await supabase.functions.invoke('order-push',{body:{type:'NEW_ORDER',order_id:data.order_id}});if(push.error)console.warn(push.error);clearCart();await refresh();setNotice('✅ Order #'+data.order_number+' placed. Pay at collection.');setTab('orders')
  }
  async function place(){
    if(!fulfilment)return setNotice('Please choose Takeaway or Eating Here.');
    if(!cart.length)return setNotice('Your basket is empty.');
    if(!profile?.mobile_verified_at){setNotice('Please verify your mobile number before ordering.');onVerifyMobile();return}
    await unlockAudio();setBusy(true);
    try{
      let pos;try{pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:0}))}catch{throw new Error('Location permission is required to place an order. Please allow location access and try again.')}
      const {data:check,error:checkError}=await supabase.rpc('order_distance',{customer_latitude:pos.coords.latitude,customer_longitude:pos.coords.longitude});
      if(checkError)throw checkError;setDistance(check.distance_m);
      if(!check.allowed)throw new Error('You are too far from the shop to place an order.');
      if(check.otp_required){
        const {error}=await supabase.auth.signInWithOtp({phone:profile.mobile_number,options:{shouldCreateUser:false}});
        if(error)throw new Error(friendlySmsError(error));
        setPendingPos(pos);setOtpStep(true);setNotice('📱 We sent a 6-digit OTP to '+profile.mobile_number+'. Enter it to place this order.');return
      }
      await create(pos,null)
    }catch(e){setNotice(e?.message||'Could not place order.')}finally{setBusy(false)}
  }
  async function verifyAndPlace(){
    if(!/^\d{6,10}$/.test(otp.trim()))return setNotice('Enter the OTP code from the SMS.');
    setBusy(true);
    try{
      const {data,error}=await supabase.auth.verifyOtp({phone:profile.mobile_number,token:otp.trim(),type:'sms'});
      if(error)throw error;
      if(data?.user?.id&&session?.user?.id&&data.user.id!==session.user.id)throw new Error('The verified mobile belongs to a different account.');
      const {data:v,error:vErr}=await supabase.rpc('mark_order_phone_verified');if(vErr)throw vErr;
      await create(pendingPos,v.verification_token);setOtpStep(false);setOtp('');setPendingPos(null)
    }catch(e){setNotice(e?.message||'OTP verification failed.')}finally{setBusy(false)}
  }
  return <section><div className="pageHead"><span className="eyebrow">CHECKOUT</span><h1>Your order</h1><p>No online payment. Pay at the counter when collecting.</p></div><div className="checkoutBox">{cart.map(x=><div className="checkoutLine" key={x.id}><span>{x.quantity} × {x.name}</span><b>{money(x.price*x.quantity)}</b></div>)}<div className="checkoutTotal"><span>Total</span><strong>{money(total)}</strong></div></div><div className="adminBox"><h2>How are you having it?</h2><label className={'choice '+(fulfilment==='TAKEAWAY'?'selected':'')}><input type="radio" name="f" checked={fulfilment==='TAKEAWAY'} onChange={()=>setFulfilment('TAKEAWAY')}/><PackageCheck/>Takeaway</label><label className={'choice '+(fulfilment==='EAT_HERE'?'selected':'')}><input type="radio" name="f" checked={fulfilment==='EAT_HERE'} onChange={()=>setFulfilment('EAT_HERE')}/><Store/>Eating Here</label><label>Order notes (optional)</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} placeholder="Any request for the kitchen?"/></div><div className="locationBox"><LocateFixed/><div><b>Location + mobile security</b><p>Within 50m, your verified registration number is enough. More than 50m away requires a fresh SMS OTP before this order is accepted.</p></div></div>{otpStep?<div className="otpBox"><KeyRound/><div><b>Verify this order</b><p>You were about {distance}m away. Enter the SMS code sent to {profile.mobile_number}.</p><input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="6-digit OTP"/><button className="primary" disabled={busy} onClick={verifyAndPlace}>{busy?'Verifying…':'Verify OTP & Place Order'}</button><button className="secondary" onClick={()=>{setOtpStep(false);setOtp('')}}>Cancel</button></div></div>:<button className="primary placeOrder" disabled={busy} onClick={place}>{busy?'Checking location…':'Place Order • Pay at Collection'}</button>}</section>
}

function statusLabel(s){return {NEW:'Order received',ACCEPTED:'Accepted',PREPARING:'Preparing',READY:'Ready to collect',COMPLETED:'Completed',CANCELLED:'Cancelled'}[s]||s}
function MyOrders({orders,session,setNotice}){return <section><div className="pageHead"><span className="eyebrow">MY ORDERS</span><h1>Order status</h1><p>We will alert you when your food is ready.</p></div><button className="alertButton" onClick={()=>enableAlerts(session,setNotice)}><BellRing/>Enable ready-to-collect alerts</button>{orders.length?orders.map(o=><article className={'orderCard status-'+o.status.toLowerCase()} key={o.order_id}><div className="orderTop"><div><small>ORDER</small><h2>#{o.order_number}</h2></div><span className="statusPill">{statusLabel(o.status)}</span></div><div className="orderMeta"><span>{o.fulfilment==='EAT_HERE'?'🍽 Eating Here':'🥡 Takeaway'}</span><span>💷 Pay at collection</span><span>📍 {o.distance_m}m away when ordered</span></div><div className="orderItems">{(o.order_items||[]).map(i=><div key={i.order_item_id}><span>{i.quantity} × {i.item_name}</span><b>{money(i.line_total)}</b></div>)}</div><div className="orderTotal"><span>Total</span><b>{money(o.total)}</b></div>{o.status==='READY'&&<div className="readyBanner"><BellRing/><div><b>Your order is ready!</b><span>Please come to the counter to collect it.</span></div></div>}<small className="orderedAt">Placed {new Date(o.created_at).toLocaleString('en-GB')}</small></article>):<div className="empty">You have not placed an order yet.</div>}</section>}
function Join({setAuthMode}){return <section className="join"><Gift size={42}/><h1>Log in to continue</h1><p>You can browse the menu without an account, but ordering, loyalty and order alerts require login.</p><button className="primary" onClick={()=>setAuthMode('register')}>Create Account</button><button className="secondary" onClick={()=>setAuthMode('login')}>Log In</button></section>}
function Rewards({account,qr}){return <section><div className="pageHead"><span className="eyebrow">MY QR</span><h1>My Loyalty QR</h1><p>{account?.points_balance??0} points • Worth {money((account?.points_balance??0)*.05)}</p></div><div className="qrCard"><QrCode/><h2>Show this QR to staff</h2><p>Use it when earning or redeeming points.</p>{qr?<img src={qr} alt="Loyalty QR"/>:<div className="empty">QR becomes available after your account profile is ready.</div>}<small>The QR identifies your account only. Staff can redeem points only in multiples of 10.</small></div><div className="rule"><Gift/><div><b>Reward rules</b><p>£1 spent = 1 point • 1 point = £0.05 • Redeem 10, 20, 30… points only.</p></div></div></section>}
function HistoryPage({tx}){const [filter,setFilter]=useState('ALL');const list=tx.filter(t=>filter==='ALL'||(filter==='EARN'&&t.points_change>0)||(filter==='REDEEM'&&t.points_change<0));return <section><div className="pageHead"><span className="eyebrow">ACTIVITY</span><h1>Rewards History</h1></div><div className="filters">{['ALL','EARN','REDEEM'].map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f==='ALL'?'All':f==='EARN'?'Earned':'Redeemed'}</button>)}</div><div className="historyList">{list.length?list.map(t=><article key={t.transaction_id}><div className={t.points_change>=0?'plus':'minus'}>{t.points_change>=0?'+':'−'}</div><div><b>{t.points_change>=0?'+':''}{t.points_change} Points</b><p>{t.description||t.transaction_type}</p><small>{new Date(t.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</small></div><span>{t.balance_after!=null?t.balance_after+' pts':''}</span></article>):<div className="empty">No reward transactions yet.</div>}</div></section>}

function Account({profile,refresh,signOut,setNotice,setAuthMode,setTab,onVerifyMobile}){const [editing,setEditing]=useState(false),[name,setName]=useState('');useEffect(()=>setName(profile?.full_name||''),[profile]);async function save(){const {error}=await supabase.from('customer_profiles').update({full_name:name.trim()}).eq('customer_id',profile.customer_id);if(error)setNotice(error.message);else{setNotice('Profile updated.');setEditing(false);refresh()}}return <section><div className="pageHead"><span className="eyebrow">ACCOUNT</span><h1>{profile?.full_name||'My Account'}</h1><p>{profile?.email}</p></div><div className="accountCard">{editing?<><label>Full name</label><input value={name} onChange={e=>setName(e.target.value)}/><button className="primary" onClick={save}><Save size={18}/>Save profile</button><button className="secondary" onClick={()=>setEditing(false)}><X size={18}/>Cancel</button></>:<><div><small>Mobile</small><b>{profile?.mobile_number||'Not added'} {profile?.mobile_verified_at?'✓':''}</b></div><div><small>Mobile status</small><b>{profile?.mobile_verified_at?'Verified':'Verification required'}</b></div><div><small>Member since</small><b>{profile?.created_at?new Date(profile.created_at).toLocaleDateString('en-GB'):'—'}</b></div><div><small>Customer ID</small><b>{profile?.customer_id?.slice(0,8)||'—'}</b></div></>}</div>{!editing&&<div className="accountActions"><button onClick={()=>setTab('orders')}><ReceiptText size={18}/>My Orders</button><button onClick={()=>setEditing(true)}><Pencil size={18}/>Edit Name</button><button onClick={onVerifyMobile}><Phone size={18}/>{profile?.mobile_verified_at?'Change / re-verify mobile':'Verify mobile number'}</button><button onClick={()=>setAuthMode('change-password')}><Settings size={18}/>Change Password</button><details><summary>Privacy Policy</summary><p>We use your account details and checkout location to operate ordering and rewards. Mobile OTP is used to confirm your number and to re-check orders placed more than 50m from the shop.</p></details><details><summary>Terms & Conditions</summary><p>Orders are pay-at-collection. £1 spent earns 1 whole point. Each point is worth 5p. Redemptions are allowed only in multiples of 10 points.</p></details></div>}<button className="danger" onClick={signOut}><LogOut size={18}/>Logout</button></section>}

function PhoneVerification({profile,close,setNotice,onDone}){
  const [phone,setPhone]=useState(profile?.mobile_number||''),[otp,setOtp]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false);
  async function send(){const p=normalisePhone(phone);if(!validPhone(p))return setNotice('Enter a valid mobile number, for example 07442 216487 or +447442216487.');setBusy(true);try{const {error}=await supabase.auth.updateUser({phone:p});if(error)throw error;setPhone(p);setSent(true);setNotice('📱 SMS code sent to '+p)}catch(e){setNotice(friendlySmsError(e))}finally{setBusy(false)}}
  async function verify(){if(!/^\d{6,10}$/.test(otp.trim()))return setNotice('Enter the OTP code from the SMS.');setBusy(true);try{const {error}=await supabase.auth.verifyOtp({phone:phone,token:otp.trim(),type:'phone_change'});if(error)throw error;const {error:sErr}=await supabase.rpc('sync_verified_mobile');if(sErr)throw sErr;setNotice('✅ Mobile number verified successfully.');await onDone()}catch(e){setNotice(e?.message||'Could not verify the SMS code.')}finally{setBusy(false)}}
  return <div className="modal"><div className="sheet phoneSheet"><button className="x" onClick={close}>×</button><Phone className="phoneHero" size={42}/><h2>Verify mobile number</h2><p className="sheetIntro">We use SMS OTP to confirm the number belongs to you.</p>{!sent?<><label>Mobile number</label><input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="07442 216487"/><button className="primary full" disabled={busy} onClick={send}>{busy?'Sending…':'Send SMS OTP'}</button></>:<><p className="otpSent">Code sent to <b>{phone}</b></p><input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="6-digit OTP"/><button className="primary full" disabled={busy} onClick={verify}>{busy?'Verifying…':'Verify Mobile'}</button><button className="link" onClick={()=>{setSent(false);setOtp('')}}>Use a different number</button></>}</div></div>
}

function Auth({mode,close,setNotice}){
  const [m,setM]=useState(mode),[busy,setBusy]=useState(false),[regPhone,setRegPhone]=useState(''),[regOtp,setRegOtp]=useState(''),[regOtpStep,setRegOtpStep]=useState(false);
  useEffect(()=>setM(mode),[mode]);
  async function submit(e){
    e.preventDefault();if(!configured)return setNotice('App configuration is not ready.');setBusy(true);
    const fd=new FormData(e.currentTarget),email=fd.get('email'),password=fd.get('password');let err;
    try{
      if(m==='register'){
        const phone=normalisePhone(fd.get('mobile'));if(!validPhone(phone))throw new Error('Enter a valid mobile number. Mobile verification is compulsory.');
        if(password!==fd.get('confirm'))throw new Error('Passwords do not match.');
        const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:fd.get('name'),mobile_number:phone},emailRedirectTo:location.origin}});if(error)throw error;
        if(data.session){const {error:pErr}=await supabase.auth.updateUser({phone});if(pErr)throw new Error(friendlySmsError(pErr));setRegPhone(phone);setRegOtpStep(true);setNotice('📱 Account created. Enter the SMS OTP sent to '+phone+' to finish registration.');return}
        setNotice('Account created. Confirm your email first, then log in and verify your mobile number to finish registration.');close();return
      }
      if(m==='reset'){({error:err}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin}))}
      else if(m==='change-password'){({error:err}=await supabase.auth.updateUser({password}))}
      else{({error:err}=await supabase.auth.signInWithPassword({email,password}))}
      if(err)throw err;
      setNotice(m==='reset'?'Password reset email sent.':m==='change-password'?'Password changed successfully.':'Welcome back.');close()
    }catch(e2){setNotice(e2?.message||'Could not continue.')}finally{setBusy(false)}
  }
  async function finishRegistration(){if(!/^\d{6,10}$/.test(regOtp.trim()))return setNotice('Enter the SMS OTP code.');setBusy(true);try{const {error}=await supabase.auth.verifyOtp({phone:regPhone,token:regOtp.trim(),type:'phone_change'});if(error)throw error;const {error:sErr}=await supabase.rpc('sync_verified_mobile');if(sErr)throw sErr;setNotice('✅ Registration complete. Your mobile number is verified.');close()}catch(e){setNotice(e?.message||'OTP verification failed.')}finally{setBusy(false)}}
  if(regOtpStep)return <div className="modal"><div className="sheet phoneSheet"><Phone className="phoneHero" size={42}/><h2>Finish registration</h2><p className="sheetIntro">Enter the SMS OTP sent to <b>{regPhone}</b>.</p><input inputMode="numeric" autoComplete="one-time-code" value={regOtp} onChange={e=>setRegOtp(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="6-digit OTP"/><button className="primary full" disabled={busy} onClick={finishRegistration}>{busy?'Verifying…':'Verify & Finish Registration'}</button></div></div>;
  return <div className="modal"><div className="sheet"><button className="x" onClick={close}>×</button><img src="/logo.svg"/><h2>{m==='register'?'Create your rewards account':m==='reset'?'Reset password':m==='change-password'?'Set a new password':'Welcome back'}</h2><form onSubmit={submit}>{m==='register'&&<><input name="name" placeholder="Full name" required/><input type="tel" name="mobile" placeholder="Mobile number (required)" required/></>}{m!=='change-password'&&<input type="email" name="email" placeholder="Email address" required/>}{m!=='reset'&&<input type="password" name="password" placeholder="Password" minLength="8" required/>}{m==='register'&&<input type="password" name="confirm" placeholder="Confirm password" minLength="8" required/>}<button className="primary" disabled={busy}>{busy?'Please wait…':m==='register'?'Create Account & Verify Mobile':m==='reset'?'Send Reset Email':m==='change-password'?'Update Password':'Log In'}</button></form>{m==='login'&&<button className="link" onClick={()=>setM('reset')}>Forgot password?</button>}{m==='reset'&&<button className="link" onClick={()=>setM('login')}>Back to login</button>}{!['reset','change-password'].includes(m)&&<button className="link" onClick={()=>setM(m==='register'?'login':'register')}>{m==='register'?'Already a member? Log in':'New here? Create account'}</button>}</div></div>
}

function Admin({setNotice,refreshMenu,orderPulse,session}){
  const [view,setView]=useState('orders'),[q,setQ]=useState(''),[results,setResults]=useState([]),[selected,setSelected]=useState(null),[amount,setAmount]=useState(''),[redeem,setRedeem]=useState(''),[recent,setRecent]=useState([]),[adminMenu,setAdminMenu]=useState([]),[orders,setOrders]=useState([]);
  useEffect(()=>{loadRecent();loadMenu();loadOrders()},[]);useEffect(()=>{loadOrders()},[orderPulse]);
  async function loadRecent(){const {data}=await supabase.from('loyalty_transactions').select('transaction_id,transaction_type,points_change,created_at,balance_after,customer_profiles(full_name)').order('created_at',{ascending:false}).limit(40);setRecent(data||[])}
  async function loadMenu(){const {data}=await supabase.from('menu_items').select('*').order('category').order('sort_order');setAdminMenu(data||[])}
  async function loadOrders(){const {data,error}=await supabase.from('orders').select('*,order_items(*),customer_profiles(full_name,email,mobile_number)').order('created_at',{ascending:false}).limit(80);if(!error)setOrders(data||[])}
  async function search(){const {data,error}=await supabase.rpc('staff_search_customers',{search_text:q});if(error)setNotice(error.message);else setResults(data||[])}
  async function award(){if(!selected)return;const total=Number(amount),pts=Math.floor(total);if(!Number.isFinite(total)||pts<1)return setNotice('Enter a valid purchase amount.');if(!confirm('Add '+pts+' points for a '+money(total)+' purchase?'))return;const {data,error}=await supabase.rpc('staff_award_points',{target_customer:selected.customer_id,purchase_total:total,idempotency_key:crypto.randomUUID()});if(error)setNotice(error.message);else{setSelected({...selected,points_balance:data.balance});setAmount('');setNotice('Added '+data.points_awarded+' points.');loadRecent()}}
  async function redeemPts(){if(!selected)return;const pts=Number(redeem);if(!Number.isInteger(pts)||pts<10||pts%10!==0)return setNotice('Points can only be redeemed in multiples of 10: 10, 20, 30…');if(!confirm('Redeem '+pts+' points ('+money(pts*.05)+')?'))return;const {data,error}=await supabase.rpc('staff_redeem_points',{target_customer:selected.customer_id,points_to_redeem:pts,idempotency_key:crypto.randomUUID()});if(error)setNotice(error.message);else{setSelected({...selected,points_balance:data.balance});setRedeem('');setNotice('Redeemed '+data.points_redeemed+' points.');loadRecent()}}
  async function editPrice(item){const next=prompt('New price for '+item.name,Number(item.price).toFixed(2));if(next===null)return;const price=Number(next);if(!Number.isFinite(price)||price<0)return setNotice('Invalid price.');const {error}=await supabase.from('menu_items').update({price}).eq('id',item.id);if(error)setNotice(error.message);else{setNotice('Menu updated.');loadMenu();refreshMenu()}}
  async function toggle(item){const {error}=await supabase.from('menu_items').update({available:!item.available}).eq('id',item.id);if(error)setNotice(error.message);else{loadMenu();refreshMenu()}}
  async function changeStatus(order,status){if(!confirm('Change order #'+order.order_number+' to '+statusLabel(status)+'?'))return;const {error}=await supabase.rpc('staff_update_order_status',{target_order:order.order_id,new_status_text:status});if(error)return setNotice(error.message);if(status==='READY'){ringAlarm('ready');await supabase.functions.invoke('order-push',{body:{type:'ORDER_READY',order_id:order.order_id}})}setNotice('Order #'+order.order_number+' → '+statusLabel(status));loadOrders()}
  return <section><div className="pageHead"><span className="eyebrow">STAFF ONLY</span><h1>Admin Dashboard</h1><p>New orders appear live. Enable alerts on the staff device.</p></div><button className="alertButton adminAlert" onClick={()=>enableAlerts(session,setNotice)}><BellRing/>Enable loud new-order alerts</button><div className="adminTabs"><button onClick={()=>setView('orders')}><ShoppingCart size={16}/>Orders</button><button onClick={()=>setView('search')}><Search size={16}/>Loyalty</button><button onClick={()=>setView('menu')}><Utensils size={16}/>Menu</button><button onClick={()=>setView('dashboard')}><ReceiptText size={16}/>Points History</button></div>
  {view==='orders'&&<div className="orderBoard">{orders.length?orders.map(o=><article className={'adminOrder status-'+o.status.toLowerCase()} key={o.order_id}><div className="orderTop"><div><small>ORDER</small><h2>#{o.order_number}</h2><p>{o.customer_profiles?.full_name} • {o.customer_phone||o.customer_profiles?.mobile_number||o.customer_profiles?.email}</p></div><span className="statusPill">{statusLabel(o.status)}</span></div><div className="orderMeta"><span>{o.fulfilment==='EAT_HERE'?'🍽 Eating Here':'🥡 Takeaway'}</span><span>💷 {money(o.total)} • Pay at collection</span><span>📍 Ordered {o.distance_m}m away</span>{o.phone_reverified_at&&<span>📱 OTP re-verified</span>}<span>🕒 {new Date(o.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span></div><div className="orderItems">{(o.order_items||[]).map(i=><div key={i.order_item_id}><span><b>{i.quantity}×</b> {i.item_name}</span><b>{money(i.line_total)}</b></div>)}</div>{o.notes&&<p className="orderNotes"><b>Note:</b> {o.notes}</p>} {!['COMPLETED','CANCELLED'].includes(o.status)&&<div className="statusActions">{o.status==='NEW'&&<button onClick={()=>changeStatus(o,'ACCEPTED')}>Accept</button>}{['NEW','ACCEPTED'].includes(o.status)&&<button onClick={()=>changeStatus(o,'PREPARING')}>Preparing</button>}{['NEW','ACCEPTED','PREPARING'].includes(o.status)&&<button className="ready" onClick={()=>changeStatus(o,'READY')}><BellRing size={16}/>Ready to Collect</button>}{o.status==='READY'&&<button className="complete" onClick={()=>changeStatus(o,'COMPLETED')}><CheckCircle2 size={16}/>Completed</button>}<button className="cancel" onClick={()=>changeStatus(o,'CANCELLED')}>Cancel</button></div>}</article>):<div className="empty">No orders yet.</div>}</div>}
  {view==='search'&&<><div className="adminBox"><div className="search"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Name, email, mobile or customer ID"/><button onClick={search}><Search/></button></div>{results.map(r=><button className="customer" key={r.customer_id} onClick={()=>setSelected(r)}><span><b>{r.full_name}</b><small>{r.email}</small></span><strong>{r.points_balance} pts</strong></button>)}</div>{selected&&<div className="adminBox"><h2>{selected.full_name}</h2><p>Current balance: <b>{selected.points_balance} points</b></p><label>Purchase total (£)</label><input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/><button className="primary" onClick={award}><PlusCircle/>Confirm & add {Math.floor(Number(amount)||0)} points</button><label>Points to redeem (multiples of 10 only)</label><input type="number" min="10" step="10" value={redeem} onChange={e=>setRedeem(e.target.value)}/><button className="secondary" onClick={redeemPts}><MinusCircle/>Redeem {redeem||0} points ({money((Number(redeem)||0)*.05)})</button></div>}</>}
  {view==='menu'&&<div className="adminBox"><h2>Menu management</h2>{adminMenu.map(item=><div className="adminMenuRow" key={item.id}><div><b>{item.name}</b><small>{item.category}</small></div><span>{Number(item.price)===0?'FREE':money(item.price)}</span><button onClick={()=>editPrice(item)}><Pencil size={15}/></button><button className={item.available?'':'off'} onClick={()=>toggle(item)}>{item.available?'On':'Off'}</button></div>)}</div>}
  {view==='dashboard'&&<div className="adminBox"><h2>Recent point transactions</h2>{recent.length?recent.map(t=><div className="txRow" key={t.transaction_id}><div><b>{t.customer_profiles?.full_name||'Customer'}</b><small>{new Date(t.created_at).toLocaleString('en-GB')}</small></div><strong className={t.points_change>=0?'pos':'neg'}>{t.points_change>=0?'+':''}{t.points_change} pts</strong></div>):<div className="empty">No transactions yet.</div>}</div>}</section>
}

createRoot(document.getElementById('root')).render(<App/>);
