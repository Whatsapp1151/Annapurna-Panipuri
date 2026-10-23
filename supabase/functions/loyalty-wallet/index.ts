import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {SignJWT,importPKCS8} from 'npm:jose@6.2.13';
import {PKPass} from 'npm:passkit-generator@3.7.0';
import {Buffer} from 'node:buffer';
import {SITE,googlePass,applePass} from './pass-data.js';
import {assets} from './brand-assets.js';

const env=(name:string)=>Deno.env.get(name)||'';
const pem=(name:string)=>env(name).replace(/\\n/g,'\n');
const headers={'Access-Control-Allow-Origin':SITE,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Vary':'Origin','Referrer-Policy':'no-referrer'};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}})}
function capabilities(){
  return {
    apple:env('WALLET_APPLE_ENABLED')==='true'&&['APPLE_PASS_TYPE_ID','APPLE_TEAM_ID','APPLE_WWDR_PEM','APPLE_SIGNER_CERT_PEM','APPLE_SIGNER_KEY_PEM'].every(k=>env(k)),
    google:env('WALLET_GOOGLE_ENABLED')==='true'&&['GOOGLE_WALLET_ISSUER_ID','GOOGLE_WALLET_CLASS_ID','GOOGLE_WALLET_CLIENT_EMAIL','GOOGLE_WALLET_PRIVATE_KEY'].every(k=>env(k))
  };
}
Deno.serve(async req=>{
  if(req.headers.get('origin')&&req.headers.get('origin')!==SITE)return json({error:'Origin not allowed'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({error:'Use POST'},405);
  try{
    // Limit request size before parsing; never log request bodies or bearer tokens.
    const raw=await req.text();if(raw.length>16384)return json({error:'Request too large'},413);
    const isForm=req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded');
    const input=isForm?Object.fromEntries(new URLSearchParams(raw)):JSON.parse(raw);
    if(!input||typeof input!=='object')return json({error:'Invalid request'},400);
    if(input.action==='status')return json(capabilities());
    const provider:unknown=input.provider;
    if(provider!=='apple'&&provider!=='google')return json({error:'Unknown wallet'},400);
    const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||(isForm?input.access_token:'');
    if(!token)return json({error:'Please log in again.'},401);
    // Gateway JWT check is disabled ONLY for Safari's direct form download.
    // Every pass request still validates the token with Auth and uses caller-scoped RLS.
    const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await client.auth.getUser(token);
    if(authError||!user)return json({error:'Please log in again.'},401);
    const [{data:profile,error:profileError},{data:role,error:roleError}]=await Promise.all([
      client.from('customer_profiles').select('customer_id,qr_token').eq('auth_user_id',user.id).maybeSingle(),
      client.from('user_roles').select('role').eq('auth_user_id',user.id).maybeSingle()
    ]);
    if(profileError||roleError)return json({error:'Could not load your loyalty account.'},503);
    if(role&&role.role!=='CUSTOMER')return json({error:'Customer accounts only.'},403);
    if(!profile?.qr_token)return json({error:'Your loyalty QR is not ready.'},404);
    if(!capabilities()[provider])return json({error:'This wallet is not available yet. Please use My QR in the app.'},503);
    if(provider==='google'){
      const issuer=env('GOOGLE_WALLET_ISSUER_ID'),classId=env('GOOGLE_WALLET_CLASS_ID');
      if(!classId.startsWith(issuer+'.'))throw new Error('Invalid issuer configuration');
      const key=await importPKCS8(pem('GOOGLE_WALLET_PRIVATE_KEY'),'RS256');
      const jwt=await new SignJWT({typ:'savetowallet',origins:[SITE],payload:{genericObjects:[googlePass(profile,issuer,classId)]}})
        .setProtectedHeader({alg:'RS256',typ:'JWT'}).setIssuer(env('GOOGLE_WALLET_CLIENT_EMAIL')).setAudience('google').setIssuedAt().setExpirationTime('10m').sign(key);
      return json({url:'https://pay.google.com/gp/v/save/'+jwt});
    }
    const files=Object.fromEntries(Object.entries(assets).map(([name,value])=>[name,Buffer.from(value,'base64')]));
    files['pass.json']=Buffer.from(JSON.stringify(applePass(profile,env('APPLE_PASS_TYPE_ID'),env('APPLE_TEAM_ID'))));
    const pass=new PKPass(files,{wwdr:pem('APPLE_WWDR_PEM'),signerCert:pem('APPLE_SIGNER_CERT_PEM'),signerKey:pem('APPLE_SIGNER_KEY_PEM'),signerKeyPassphrase:env('APPLE_SIGNER_KEY_PASSPHRASE')||undefined});
    return new Response(new Uint8Array(pass.getAsBuffer()),{headers:{...headers,'Content-Type':'application/vnd.apple.pkpass','Content-Disposition':'attachment; filename="Annapurna-Loyalty.pkpass"'}});
  }catch{
    return json({error:'Your wallet card could not be prepared. Return to My QR and try again.'},500);
  }
});
