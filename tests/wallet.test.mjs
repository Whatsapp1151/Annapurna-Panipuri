import test from 'node:test';
import assert from 'node:assert/strict';
import {walletProvider} from '../src/wallet-device.js';
import {applePass,googlePass,barcode} from '../supabase/functions/loyalty-wallet/pass-data.js';

test('wallet appears only in installed mode on a supported mobile platform',()=>{
  for(const userAgent of ['Mozilla iPhone','Mozilla Android'])assert.equal(walletProvider({userAgent}),null);
  assert.equal(walletProvider({userAgent:'Mozilla iPhone',standalone:true}),'apple');
  assert.equal(walletProvider({userAgent:'Mozilla Android',standalone:true}),'google');
  assert.equal(walletProvider({platform:'MacIntel',maxTouchPoints:5,standalone:true}),'apple');
  assert.equal(walletProvider({platform:'MacIntel',maxTouchPoints:0,standalone:true}),null);
  assert.equal(walletProvider({userAgent:'Windows',standalone:true}),null);
});
test('both wallets contain exactly the existing scanner value and stable customer identity',()=>{
  const p={customer_id:'abc-123',qr_token:'random-test-token'};
  const a=applePass(p,'pass.example','TEAM123');const g=googlePass(p,'123','123.loyalty');
  assert.equal(a.barcodes[0].message,'annapurna:random-test-token');
  assert.equal(g.barcode.value,a.barcodes[0].message);
  assert.equal(a.serialNumber,'customer_abc-123');assert.equal(g.id,'123.customer_abc-123');
  assert.equal(a.passTypeIdentifier,'pass.example');assert.equal(g.classId,'123.loyalty');
  assert.equal(g.id,googlePass({...p,qr_token:'new-token'},'123','123.loyalty').id);
  assert.throws(()=>barcode({customer_id:'abc'}));
});
test('passes do not include stale balance, contact details or login credentials',()=>{
 const p={customer_id:'abc',qr_token:'test',email:'secret@example.org',access_token:'jwt-secret',points_balance:999};
 for(const pass of [applePass(p,'pass.example','TEAM'),googlePass(p,'123','123.loyalty')]){
  const s=JSON.stringify(pass);assert.ok(!s.includes(p.email));assert.ok(!s.includes(p.access_token));assert.ok(!s.includes('999'));
 }
});
