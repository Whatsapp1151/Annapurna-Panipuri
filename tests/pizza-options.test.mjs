import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TOPPINGS,extraToppingPence,cartLine,appendCart,checkoutTotal,isPizza} from '../src/pizza-options.js';
const pizza={id:'p',name:'Paneer Pizza',category:'Pizza Khakhra',price:6};
test('0–5 toppings are included; 6, 7 and 8 add 60p, £1.20 and £1.80 per pizza',()=>{
 for(let n=0;n<=8;n++)assert.equal(extraToppingPence(TOPPINGS.slice(0,n)),Math.max(0,n-5)*60);
 assert.equal(cartLine(pizza,TOPPINGS,2).price,7.8);
});
test('different pizzas stay separate; same selection in a different order merges',()=>{
 const a=cartLine(pizza,TOPPINGS.slice(0,6)),b=cartLine(pizza,[TOPPINGS[7]]);
 let cart=appendCart([],a);cart=appendCart(cart,b);assert.equal(cart.length,2);
 cart=appendCart(cart,cartLine(pizza,TOPPINGS.slice(0,6).reverse()));assert.equal(cart.length,2);assert.equal(cart[0].quantity,2);
 assert.throws(()=>cartLine(pizza,['Onion','Onion']));assert.throws(()=>cartLine(pizza,['Mushrooms']));
 assert.ok(isPizza({category:'Pizza'}));assert.ok(isPizza(pizza));assert.ok(!isPizza({category:'Momos'}));
});
test('takeaway is 50p per order and does not get discounted; eating here is free',()=>{
 assert.deepEqual(checkoutTotal(7.6,'TAKEAWAY'),{subtotal:7.6,discount:0,takeawayCharge:.5,total:8.1});
 assert.equal(checkoutTotal(15.2,'TAKEAWAY').takeawayCharge,.5);
 assert.equal(checkoutTotal(7.6,'EAT_HERE').total,7.6);
 assert.equal(checkoutTotal(7.6,'TAKEAWAY',7.6).total,.5);
});
