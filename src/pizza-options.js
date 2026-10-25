export const TOPPINGS=['Capsicum','Onion','Green chilli','Tomato','Sweet corn','Jalapenos','Black olives','Pineapple'];
export const FREE_TOPPINGS=5;
export const EXTRA_TOPPING_PENCE=60;
export const TAKEAWAY_PENCE=50;
export const isPizza=item=>String(item?.category||'').toLowerCase().includes('pizza');
export const displayDishName=item=>isPizza(item)?String(item.name).replace(/\s*\([^)]*\)\s*$/,''):item.name;
export function normaliseToppings(selected){
  if(!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.some(t=>!TOPPINGS.includes(t)))throw new Error('Please choose toppings from the list.');
  return TOPPINGS.filter(t=>selected.includes(t));
}
export const extraToppingPence=selected=>Math.max(0,normaliseToppings(selected).length-FREE_TOPPINGS)*EXTRA_TOPPING_PENCE;
export function cartLine(item,selected=[],quantity=1){
  const toppings=normaliseToppings(selected);
  if(!isPizza(item)&&toppings.length)throw new Error('Toppings are only available on pizzas.');
  const extra=extraToppingPence(toppings);
  return {id:item.id,cartKey:isPizza(item)?item.id+':'+toppings.join('|'):item.id,name:displayDishName(item),price:(Math.round(Number(item.price)*100)+extra)/100,quantity,toppings:isPizza(item)?toppings:null,toppingsExtra:extra/100};
}
export function appendCart(cart,line){
  const old=cart.find(x=>x.cartKey===line.cartKey);
  return old?cart.map(x=>x.cartKey===line.cartKey?{...x,quantity:x.quantity+line.quantity}:x):[...cart,line];
}
export function checkoutTotal(subtotal,fulfilment,discount=0){
  const food=Math.round(Number(subtotal)*100),off=Math.min(food,Math.max(0,Math.round(Number(discount)*100)));
  const fee=fulfilment==='TAKEAWAY'?TAKEAWAY_PENCE:0;
  return {subtotal:food/100,discount:off/100,takeawayCharge:fee/100,total:(food-off+fee)/100};
}
