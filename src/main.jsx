import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import QRCode from 'qrcode';
import {Home,Utensils,Gift,History,User,LogOut,ShieldCheck,QrCode,Search,PlusCircle,MinusCircle,ChevronRight,Pencil,Save,X,Settings,ReceiptText} from 'lucide-react';
import {supabase,configured} from './supabase';
import './styles.css';

const money=n=>'£'+Number(n||0).toFixed(2);
const first=n=>(n||'Customer').trim().split(/\s+/)[0];

function App(){
  const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[account,setAccount]=useState(null),
    [tx,setTx]=useState([]),[menu,setMenu]=useState([]),[tab,setTab]=useState('home'),
    [authMode,setAuthMode]=useState(null),[notice,setNotice]=useState(''),[qr,setQr]=useState(''),[role,setRole]=useState('CUSTOMER');

  useEffect(()=>{
    if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
    if(!configured)return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{
      setSession(s);
      if(event==='PASSWORD_RECOVERY')setAuthMode('change-password');
    });
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    loadMenu();
    if(session?.user)loadPrivate();
    else{setProfile(null);setAccount(null);setTx([]);setRole('CUSTOMER');setQr('')}
  },[session]);

  async function loadMenu(){
    if(!configured)return;
    const {data,error}=await supabase.from('menu_items').select('*').order('category').order('sort_order');
    if(!error&&data)setMenu(data);
  }

  async function loadPrivate(){
    const uid=session.user.id;
    const [{data:p},{data:r}]=await Promise.all([
      supabase.from('customer_profiles').select('*').eq('auth_user_id',uid).single(),
      supabase.from('user_roles').select('role').eq('auth_user_id',uid).single()
    ]);
    setProfile(p||null); setRole(r?.role||'CUSTOMER');
    if(p){
      const [{data:a},{data:t}]=await Promise.all([
        supabase.from('loyalty_accounts').select('*').eq('customer_id',p.customer_id).single(),
        supabase.from('loyalty_transactions').select('*').eq('customer_id',p.customer_id).order('created_at',{ascending:false})
      ]);
      setAccount(a||null); setTx(t||[]);
      if(p.qr_token)QRCode.toDataURL('annapurna:'+p.qr_token,{width:360,margin:2}).then(setQr);
    }
  }

  async function signOut(){await supabase.auth.signOut();setTab('home')}
  const isStaff=['STAFF','ADMIN'].includes(role);
  const gated=!session&&['rewards','history','account'].includes(tab);

  return <div className="app">
    <header>
      <img src="/logo.svg" alt="Annapurna Panipuri"/>
      <div className="brand"><b>Annapurna Panipuri</b><small>Fresh street food • Annapurna Rewards</small></div>
      {isStaff&&<button className="staffPill" onClick={()=>setTab('admin')}><ShieldCheck size={16}/>Staff</button>}
    </header>

    <main>
      {notice&&<div className="notice" onClick={()=>setNotice('')}>{notice}</div>}
      {tab==='home'&&<HomePage session={session} profile={profile} account={account} setTab={setTab} setAuthMode={setAuthMode} menu={menu.filter(x=>x.available)}/>}
      {tab==='menu'&&<Menu menu={menu.filter(x=>x.available)}/>}
      {gated&&<Join setAuthMode={setAuthMode}/>}
      {!gated&&tab==='rewards'&&<Rewards account={account} qr={qr}/>}
      {!gated&&tab==='history'&&<HistoryPage tx={tx}/>}
      {!gated&&tab==='account'&&<Account profile={profile} refresh={loadPrivate} signOut={signOut} setNotice={setNotice} setAuthMode={setAuthMode}/>}
      {tab==='admin'&&isStaff&&<Admin setNotice={setNotice} refreshMenu={loadMenu}/>}
    </main>

    <nav>{[['home',Home,'Home'],['menu',Utensils,'Menu'],['rewards',Gift,'Rewards'],['history',History,'History'],['account',User,'Account']].map(([k,I,l])=>
      <button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}><I size={21}/><span>{l}</span></button>
    )}</nav>

    {authMode&&<Auth mode={authMode} close={()=>setAuthMode(null)} setNotice={setNotice}/>}
  </div>
}

function HomePage({session,profile,account,setTab,setAuthMode,menu}){
  return <>
    <section className="hero">
      <span className="eyebrow">ANNAPURNA REWARDS</span>
      <h1>{session?'Welcome, '+first(profile?.full_name)+' 👋':'Street food, rewarded.'}</h1>
      <p>{session?'Your rewards are ready whenever you visit.':'Explore our menu freely. Create an account when you’re ready to start earning rewards.'}</p>
      {!session&&<div className="actions"><button className="primary" onClick={()=>setAuthMode('register')}>Create free account</button><button className="secondary" onClick={()=>setAuthMode('login')}>Log in</button></div>}
    </section>

    {session&&<section className="pointsCard">
      <small>YOUR POINTS</small><strong>⭐ {account?.points_balance??0} Points</strong>
      <p>Reward Value <b>{money((account?.points_balance??0)*.05)}</b></p>
      <div className="stats"><div><b>{account?.lifetime_points_earned??0}</b><span>Earned</span></div><div><b>{account?.lifetime_points_redeemed??0}</b><span>Redeemed</span></div></div>
      <button onClick={()=>setTab('history')}>View rewards history <ChevronRight size={18}/></button>
    </section>}

    <section>
      <div className="sectionTitle"><h2>Popular picks</h2><button onClick={()=>setTab('menu')}>See menu</button></div>
      <div className="popular">{menu.slice(0,4).map(x=><article key={x.id}><div className="foodIcon">🥣</div><b>{x.name}</b><span>{Number(x.price)===0?'FREE':money(x.price)}</span></article>)}</div>
    </section>

    <section className="rule"><Gift/><div><b>5% back in rewards</b><p>Earn 1 point for every complete £1 spent. Every point is worth 5p.</p></div></section>
  </>
}

function Menu({menu}){
  const [search,setSearch]=useState('');
  const filtered=menu.filter(x=>x.name.toLowerCase().includes(search.toLowerCase())||x.category.toLowerCase().includes(search.toLowerCase()));
  const groups=useMemo(()=>Object.entries(filtered.reduce((a,m)=>((a[m.category]??=[]).push(m),a),{})),[filtered]);
  return <section>
    <div className="pageHead"><span className="eyebrow">OUR MENU</span><h1>Made for cravings.</h1><p>No account needed to browse.</p></div>
    <input className="menuSearch" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search menu..."/>
    {groups.map(([cat,items])=><div className="category" key={cat}><h2>{cat}</h2>{items.map(x=><div className="menuRow" key={x.id}><div><b>{x.name}</b><small>{x.vegetarian?'● Vegetarian':''}</small></div><strong>{Number(x.price)===0?'FREE':money(x.price)}</strong></div>)}</div>)}
  </section>
}

function Join({setAuthMode}){return <section className="join"><Gift size={42}/><h1>Join Annapurna Rewards</h1><p>Create your free account and earn points every time you visit.</p><button className="primary" onClick={()=>setAuthMode('register')}>Create Account</button><button className="secondary" onClick={()=>setAuthMode('login')}>Log In</button></section>}

function Rewards({account,qr}){return <section><div className="pageHead"><span className="eyebrow">REWARDS</span><h1>{account?.points_balance??0} Points</h1><p>Worth {money((account?.points_balance??0)*.05)}</p></div><div className="qrCard"><QrCode/><h2>My Loyalty QR</h2><p>Show this to staff when you pay.</p>{qr?<img src={qr}/>:<div className="empty">QR becomes available after your account profile is created.</div>}<small>This QR identifies your account only. It cannot add or redeem points.</small></div><div className="rule"><Gift/><div><b>How it works</b><p>£1 spent = 1 point • 1 point = £0.05</p></div></div></section>}

function HistoryPage({tx}){
  const [filter,setFilter]=useState('ALL');
  const list=tx.filter(t=>filter==='ALL'||(filter==='EARN'&&t.points_change>0)||(filter==='REDEEM'&&t.points_change<0));
  return <section><div className="pageHead"><span className="eyebrow">ACTIVITY</span><h1>Rewards History</h1></div><div className="filters">{['ALL','EARN','REDEEM'].map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f==='ALL'?'All':f==='EARN'?'Earned':'Redeemed'}</button>)}</div><div className="historyList">{list.length?list.map(t=><article key={t.transaction_id}><div className={t.points_change>=0?'plus':'minus'}>{t.points_change>=0?'+':'−'}</div><div><b>{t.points_change>=0?'+':''}{t.points_change} Points</b><p>{t.description||t.transaction_type}</p><small>{new Date(t.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</small></div><span>{t.balance_after!=null?t.balance_after+' pts':''}</span></article>):<div className="empty">No reward transactions yet.</div>}</div></section>
}

function Account({profile,refresh,signOut,setNotice,setAuthMode}){
  const [editing,setEditing]=useState(false),[name,setName]=useState(''),[mobile,setMobile]=useState('');
  useEffect(()=>{setName(profile?.full_name||'');setMobile(profile?.mobile_number||'')},[profile]);

  async function save(){
    const {error}=await supabase.from('customer_profiles').update({full_name:name.trim(),mobile_number:mobile.trim()||null}).eq('customer_id',profile.customer_id);
    if(error)setNotice(error.message); else{setNotice('Profile updated.');setEditing(false);refresh()}
  }

  return <section>
    <div className="pageHead"><span className="eyebrow">ACCOUNT</span><h1>{profile?.full_name||'My Account'}</h1><p>{profile?.email}</p></div>
    <div className="accountCard">
      {editing?<><label>Full name</label><input value={name} onChange={e=>setName(e.target.value)}/><label>Mobile</label><input value={mobile} onChange={e=>setMobile(e.target.value)}/><button className="primary" onClick={save}><Save size={18}/>Save profile</button><button className="secondary" onClick={()=>setEditing(false)}><X size={18}/>Cancel</button></>
      :<><div><small>Mobile</small><b>{profile?.mobile_number||'Not added'}</b></div><div><small>Member since</small><b>{profile?.created_at?new Date(profile.created_at).toLocaleDateString('en-GB'):'—'}</b></div><div><small>Customer ID</small><b>{profile?.customer_id?.slice(0,8)||'—'}</b></div></>}
    </div>
    {!editing&&<div className="accountActions"><button onClick={()=>setEditing(true)}><Pencil size={18}/>Edit Profile</button><button onClick={()=>setAuthMode('change-password')}><Settings size={18}/>Change Password</button><details><summary>Privacy Policy</summary><p>We use your account details to operate the Annapurna Rewards loyalty programme. Customers cannot edit loyalty balances or transactions.</p></details><details><summary>Terms & Conditions</summary><p>£1 spent earns 1 whole point. Each point is worth 5p. Points can only be added or redeemed by authorised staff.</p></details></div>}
    <button className="danger" onClick={signOut}><LogOut size={18}/>Logout</button>
  </section>
}

function Auth({mode,close,setNotice}){
  const [m,setM]=useState(mode),[busy,setBusy]=useState(false);
  useEffect(()=>setM(mode),[mode]);

  async function submit(e){
    e.preventDefault(); if(!configured)return setNotice('App configuration is not ready.');
    setBusy(true); const fd=new FormData(e.currentTarget),email=fd.get('email'),password=fd.get('password'); let err;
    if(m==='register'){
      if(password!==fd.get('confirm')){setBusy(false);return setNotice('Passwords do not match.')}
      ({error:err}=await supabase.auth.signUp({email,password,options:{data:{full_name:fd.get('name'),mobile_number:fd.get('mobile')},emailRedirectTo:location.origin}}));
    }else if(m==='reset'){
      ({error:err}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin}));
    }else if(m==='change-password'){
      ({error:err}=await supabase.auth.updateUser({password}));
    }else{
      ({error:err}=await supabase.auth.signInWithPassword({email,password}));
    }
    setBusy(false);
    if(err)return setNotice(err.message);
    setNotice(m==='reset'?'Password reset email sent.':m==='register'?'Welcome to Annapurna Rewards! Check your email if confirmation is required.':m==='change-password'?'Password changed successfully.':'Welcome back.');
    close();
  }

  return <div className="modal"><div className="sheet"><button className="x" onClick={close}>×</button><img src="/logo.svg"/><h2>{m==='register'?'Create your rewards account':m==='reset'?'Reset password':m==='change-password'?'Set a new password':'Welcome back'}</h2><form onSubmit={submit}>{m==='register'&&<><input name="name" placeholder="Full name" required/><input name="mobile" placeholder="Mobile number (optional)"/></>}{m!=='change-password'&&<input type="email" name="email" placeholder="Email address" required/>}{m!=='reset'&&<input type="password" name="password" placeholder="Password" minLength="8" required/>}{m==='register'&&<input type="password" name="confirm" placeholder="Confirm password" minLength="8" required/>}<button className="primary" disabled={busy}>{busy?'Please wait…':m==='register'?'Create Account':m==='reset'?'Send Reset Email':m==='change-password'?'Update Password':'Log In'}</button></form>{m==='login'&&<button className="link" onClick={()=>setM('reset')}>Forgot password?</button>}{m==='reset'&&<button className="link" onClick={()=>setM('login')}>Back to login</button>}{!['reset','change-password'].includes(m)&&<button className="link" onClick={()=>setM(m==='register'?'login':'register')}>{m==='register'?'Already a member? Log in':'New here? Create account'}</button>}</div></div>
}

function Admin({setNotice,refreshMenu}){
  const [view,setView]=useState('dashboard'),[q,setQ]=useState(''),[results,setResults]=useState([]),[selected,setSelected]=useState(null),[amount,setAmount]=useState(''),[redeem,setRedeem]=useState(''),[recent,setRecent]=useState([]),[adminMenu,setAdminMenu]=useState([]);

  useEffect(()=>{loadRecent();loadMenu()},[]);

  async function loadRecent(){
    const {data}=await supabase.from('loyalty_transactions').select('transaction_id,transaction_type,points_change,created_at,balance_after,customer_profiles(full_name)').order('created_at',{ascending:false}).limit(40);
    setRecent(data||[]);
  }
  async function loadMenu(){const {data}=await supabase.from('menu_items').select('*').order('category').order('sort_order');setAdminMenu(data||[])}
  async function search(){const {data,error}=await supabase.rpc('staff_search_customers',{search_text:q});if(error)setNotice(error.message);else setResults(data||[])}

  async function award(){
    if(!selected)return; const total=Number(amount),pts=Math.floor(total); if(!Number.isFinite(total)||pts<1)return setNotice('Enter a valid purchase amount.');
    if(!confirm('Add '+pts+' points for a '+money(total)+' purchase?'))return;
    const {data,error}=await supabase.rpc('staff_award_points',{target_customer:selected.customer_id,purchase_total:total,idempotency_key:crypto.randomUUID()});
    if(error)setNotice(error.message);else{setSelected({...selected,points_balance:data.balance});setAmount('');setNotice('Added '+data.points_awarded+' points.');loadRecent()}
  }
  async function redeemPts(){
    if(!selected)return; const pts=Number(redeem); if(!Number.isInteger(pts)||pts<1)return setNotice('Enter whole points to redeem.');
    if(!confirm('Redeem '+pts+' points ('+money(pts*.05)+')?'))return;
    const {data,error}=await supabase.rpc('staff_redeem_points',{target_customer:selected.customer_id,points_to_redeem:pts,idempotency_key:crypto.randomUUID()});
    if(error)setNotice(error.message);else{setSelected({...selected,points_balance:data.balance});setRedeem('');setNotice('Redeemed '+data.points_redeemed+' points.');loadRecent()}
  }
  async function editPrice(item){
    const next=prompt('New price for '+item.name,Number(item.price).toFixed(2)); if(next===null)return; const price=Number(next);
    if(!Number.isFinite(price)||price<0)return setNotice('Invalid price.');
    const {error}=await supabase.from('menu_items').update({price}).eq('id',item.id); if(error)setNotice(error.message);else{setNotice('Menu updated.');loadMenu();refreshMenu()}
  }
  async function toggle(item){
    const {error}=await supabase.from('menu_items').update({available:!item.available}).eq('id',item.id); if(error)setNotice(error.message);else{loadMenu();refreshMenu()}
  }

  return <section>
    <div className="pageHead"><span className="eyebrow">STAFF ONLY</span><h1>Rewards Admin</h1><p>All point changes are validated and recorded by the backend.</p></div>
    <div className="adminTabs"><button onClick={()=>setView('dashboard')}><ReceiptText size={16}/>Transactions</button><button onClick={()=>setView('search')}><Search size={16}/>Find Customer</button><button onClick={()=>setView('menu')}><Utensils size={16}/>Manage Menu</button></div>

    {view==='search'&&<div className="adminBox"><div className="search"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Name, email, mobile or customer ID"/><button onClick={search}><Search/></button></div>{results.map(r=><button className="customer" key={r.customer_id} onClick={()=>setSelected(r)}><span><b>{r.full_name}</b><small>{r.email}</small></span><strong>{r.points_balance} pts</strong></button>)}</div>}

    {selected&&view==='search'&&<div className="adminBox"><h2>{selected.full_name}</h2><p>Current balance: <b>{selected.points_balance} points</b></p><label>Purchase total (£)</label><input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/><button className="primary" onClick={award}><PlusCircle/>Confirm & add {Math.floor(Number(amount)||0)} points</button><label>Points to redeem</label><input type="number" min="1" step="1" value={redeem} onChange={e=>setRedeem(e.target.value)}/><button className="secondary" onClick={redeemPts}><MinusCircle/>Redeem {redeem||0} points ({money((Number(redeem)||0)*.05)})</button></div>}

    {view==='menu'&&<div className="adminBox"><h2>Menu management</h2>{adminMenu.map(item=><div className="adminMenuRow" key={item.id}><div><b>{item.name}</b><small>{item.category}</small></div><span>{Number(item.price)===0?'FREE':money(item.price)}</span><button onClick={()=>editPrice(item)}><Pencil size={15}/></button><button className={item.available?'':'off'} onClick={()=>toggle(item)}>{item.available?'On':'Off'}</button></div>)}</div>}

    {view==='dashboard'&&<div className="adminBox"><h2>Recent transactions</h2>{recent.length?recent.map(t=><div className="txRow" key={t.transaction_id}><div><b>{t.customer_profiles?.full_name||'Customer'}</b><small>{new Date(t.created_at).toLocaleString('en-GB')}</small></div><strong className={t.points_change>=0?'pos':'neg'}>{t.points_change>=0?'+':''}{t.points_change} pts</strong></div>):<div className="empty">No transactions yet.</div>}</div>}
  </section>
}

createRoot(document.getElementById('root')).render(<App/>);
