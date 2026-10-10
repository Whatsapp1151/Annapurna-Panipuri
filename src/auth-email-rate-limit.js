function addRateLimitStyles(){
  if(document.getElementById('ap-auth-rate-limit-css'))return;
  const style=document.createElement('style');
  style.id='ap-auth-rate-limit-css';
  style.textContent=`
    .ap-auth-limit-backdrop{position:fixed;inset:0;z-index:100001;background:rgba(20,28,18,.74);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;backdrop-filter:blur(4px)}
    .ap-auth-limit-card{width:min(440px,100%);background:#fffaf0;border:2px solid #e0bd63;border-radius:24px;padding:26px 22px;box-shadow:0 24px 70px rgba(0,0,0,.28);text-align:center;color:#203b1b}
    .ap-auth-limit-icon{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;margin:0 auto 14px;background:#fff1d1;font-size:34px}
    .ap-auth-limit-card h2{margin:4px 0 10px;color:#244d1c;font-size:24px;line-height:1.15}
    .ap-auth-limit-card p{margin:8px 0;color:#4c5748;line-height:1.55;font-size:15px}
    .ap-auth-limit-note{margin:14px 0;padding:12px;border:1px solid #e6cb8a;border-radius:14px;background:#fff5d9;text-align:left;font-size:14px;line-height:1.45}
    .ap-auth-limit-card button{width:100%;border:0;border-radius:13px;padding:13px 14px;margin-top:10px;background:#244d1c;color:#fff;font:inherit;font-weight:800;cursor:pointer}
  `;
  document.head.appendChild(style);
}

function showRateLimitModal(){
  if(document.querySelector('.ap-auth-limit-backdrop'))return;
  const email=sessionStorage.getItem('ap-last-signup-email')||'';
  const wrap=document.createElement('div');
  wrap.className='ap-auth-limit-backdrop';
  wrap.innerHTML=`<div class="ap-auth-limit-card" role="dialog" aria-modal="true">
    <div class="ap-auth-limit-icon">✉️</div>
    <h2>Email verification is temporarily busy</h2>
    <p>We could not send the verification email right now.</p>
    ${email?`<p><b>${email.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</b></p>`:''}
    <div class="ap-auth-limit-note"><b>Please do not keep pressing Create Account.</b><br>This is a temporary email-sending limit. Wait and try again later. If your account was already created, use the verification-email option once email sending is available again.</div>
    <p>Your password and personal details are not the cause of this error.</p>
    <button type="button">OK</button>
  </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('button')?.addEventListener('click',()=>wrap.remove());
}

let last='';
function scan(){
  const text=[...document.querySelectorAll('.notice')].map(x=>x.textContent||'').join(' | ');
  if(!text||text===last)return;
  last=text;
  if(/email rate limit exceeded|over_email_send_rate_limit|too many requests/i.test(text))showRateLimitModal();
}

addRateLimitStyles();
scan();
setInterval(scan,250);
