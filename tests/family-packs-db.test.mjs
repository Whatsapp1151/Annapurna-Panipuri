import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=await PGlite.create();
await db.exec(await readFile(new URL('./ordering-schema.sql',import.meta.url),'utf8'));
const folder=new URL('../supabase/migrations/',import.meta.url);
const base=(await readdir(folder)).find(x=>x.endsWith('pizza_toppings_early_close_takeaway_fee.sql'));
await db.exec(await readFile(new URL(base,folder),'utf8'));
const pani='00000000-0000-0000-0000-000000000020',ragda='00000000-0000-0000-0000-000000000021',tea='00000000-0000-0000-0000-000000000011';
await db.exec(`alter table menu_items add column updated_at timestamptz default now();
insert into menu_items(id,name,category,price,listed,available) values('${pani}','Panipuri Family Pack','Panipuri & Chaats',13.50,true,true),('${ragda}','Ragdapuri Family Pack','Panipuri & Chaats',20,true,true);`);
const change=await readFile(new URL('../database/family-packs-takeaway.sql',import.meta.url),'utf8');
await db.exec(change);
async function order(ids,mode){return (await db.query('select create_order_v3($1,51,-.2,$2::jsonb,null,null,null) result',[mode,JSON.stringify(ids.map(id=>({menu_item_id:id,quantity:1})))] )).rows[0].result;}
async function reset(){await db.exec('truncate orders,order_items,order_status_history,promotion_redemptions');}
test('both family packs and mixed baskets reject dine-in with no saved orders',async()=>{
 for(const ids of [[pani],[ragda],[pani,ragda],[tea,pani]]){
  await reset();await assert.rejects(order(ids,'EAT_HERE'),/Family packs are available for takeaway only/);
  assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,0);
 }
});
test('takeaway family packs use original prices and one takeaway fee; ordinary dine-in stays available',async()=>{
 await reset();const take=await order([pani,ragda],'TAKEAWAY');assert.equal(take.total,34);assert.equal(take.takeaway_charge,.5);
 const dine=await order([tea],'EAT_HERE');assert.equal(dine.total,1);assert.equal(dine.takeaway_charge,0);
});
test('restriction applies to attempted merges and migration can be applied again',async()=>{
 await reset();await order([tea],'EAT_HERE');await assert.rejects(order([pani],'EAT_HERE'),/takeaway only/);
 assert.equal((await db.query('select count(*)::int n from order_items')).rows[0].n,1);
 await db.exec(change);await assert.rejects(order([ragda],'EAT_HERE'),/takeaway only/);
});
