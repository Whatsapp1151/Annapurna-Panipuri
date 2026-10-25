// Run with: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/ordering-db.test.mjs
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';
import {TOPPINGS} from '../src/pizza-options.js';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=await PGlite.create();await db.exec(await readFile(new URL('./ordering-schema.sql',import.meta.url),'utf8'));
const migrations=new URL('../supabase/migrations/',import.meta.url);const file=(await readdir(migrations)).find(x=>x.endsWith('pizza_toppings_early_close_takeaway_fee.sql'));
try{await db.exec(await readFile(new URL(file,migrations),'utf8'));}catch(e){console.error('Migration error:',e.message,'at',e.position);process.exit(1)}
const pizza='00000000-0000-0000-0000-000000000010',tea='00000000-0000-0000-0000-000000000011';
const item=(toppings,quantity=1)=>({menu_item_id:pizza,quantity,toppings,unit_price:0,total:0,toppings_extra:0});
async function order(items,fulfilment='TAKEAWAY',promo=null){return (await db.query('select public.create_order_v3($1,51,-.2,$2::jsonb,null,$3,null) result',[fulfilment,JSON.stringify(items),promo])).rows[0].result}
async function reset(){await db.exec("truncate public.orders,public.order_items,public.order_status_history,public.promotion_redemptions;update order_settings set closed_early_on=null,ordering_enabled=true;");}
test('database prices 0–8 toppings, rejects unknown, duplicate, missing and non-pizza toppings',async()=>{
 for(let n=0;n<=8;n++){const r=(await db.query('select * from private.pizza_topping_price($1,$2::jsonb)',['Pizza Khakhra',JSON.stringify(TOPPINGS.slice(0,n))])).rows[0];assert.equal(Number(r.extra),Math.max(0,n-5)*60/100);}
 for(const bad of [null,{},['Onion','Onion'],['Unknown'],[1]])await assert.rejects(db.query('select * from private.pizza_topping_price($1,$2::jsonb)',['Pizza',JSON.stringify(bad)]));
 await assert.rejects(db.query("select * from private.pizza_topping_price('Drinks','[\"Onion\"]')"));
 await assert.rejects(order([{menu_item_id:pizza,quantity:1}]));
});
test('real create_order_v3 uses server prices and one 50p fee through merges and quantities',async()=>{
 await reset();const first=await order([item(TOPPINGS.slice(0,6),2)]);assert.equal(first.total,13.7);assert.equal(first.takeaway_charge,.5);
 const second=await order([item(TOPPINGS.slice(0,6).reverse()),item(['Onion'])]);assert.equal(second.order_id,first.order_id);assert.equal(second.total,26.3);assert.equal(second.merged,true);
 const lines=(await db.query('select quantity,toppings,unit_price from order_items order by quantity')).rows;
 assert.equal(lines.length,2);assert.equal(lines[1].quantity,3);assert.equal(Number(lines[1].unit_price),6.6);
 const bill=(await db.query('select subtotal,total,takeaway_charge from orders')).rows[0];assert.equal(Number(bill.takeaway_charge),.5);assert.equal(Number(bill.total),26.3);
});
test('eating here has no fee; promotions discount food only',async()=>{
 await reset();const eat=await order([item(TOPPINGS)],'EAT_HERE');assert.equal(eat.total,7.8);assert.equal(eat.takeaway_charge,0);
 await db.exec("insert into promotions values(gen_random_uuid(),'FOODFREE',true,now()-interval '1 day',now()+interval '1 day',0,10,null,'PERCENT',100)");
 const take=await order([item(TOPPINGS)],'TAKEAWAY','FOODFREE');assert.equal(take.subtotal,7.8);assert.equal(take.discount_amount,7.8);assert.equal(take.total,.5);
});
test('closing early blocks create_order, including order merges',async()=>{
 await reset();await order([{menu_item_id:tea,quantity:1}]);
 await db.exec("update order_settings set closed_early_on=timezone('Europe/London',now())::date");
 await assert.rejects(order([{menu_item_id:tea,quantity:1}]),/closed early/);
});
test('closure expires by the next London date; normal hours and DST still apply',async()=>{
 async function status(closedAt,at){return (await db.query("select private.ordering_status_at(jsonb_populate_record(null::public.order_settings,jsonb_build_object('ordering_enabled',true,'opens_at','10:00','closes_at','22:00','shop_timezone','Europe/London','closed_early_on',$1::text)),$2::timestamptz) s",[closedAt,at])).rows[0].s;}
 const closed=await status('2026-10-24','2026-10-24T17:00:00Z');assert.equal(closed.is_open,false);assert.equal(closed.closed_early,true);assert.equal(new Date(closed.next_open_at).toISOString(),'2026-10-25T10:00:00.000Z');
 assert.equal((await status('2026-10-24','2026-10-25T09:59:59Z')).is_open,false);
 assert.equal((await status('2026-10-24','2026-10-25T10:00:00Z')).is_open,true);
 assert.equal((await status(null,'2026-10-25T22:00:00Z')).is_open,false);
 assert.equal((await status(null,'2026-07-01T09:00:00Z')).is_open,true);
});
test('only an authenticated ADMIN can close or undo closure; customer cannot update the row directly',async()=>{
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select set_shop_closed_early(true)'),/Administrator/);
 const changed=await db.query('update order_settings set closed_early_on=null where id=1 returning id');assert.equal(changed.rows.length,0);
 await db.query("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false)");
 assert.equal((await db.query('select set_shop_closed_early(true) s')).rows[0].s.closed_early,true);
 assert.equal((await db.query('select set_shop_closed_early(false) s')).rows[0].s.closed_early,false);
 await db.exec('reset role');
});
