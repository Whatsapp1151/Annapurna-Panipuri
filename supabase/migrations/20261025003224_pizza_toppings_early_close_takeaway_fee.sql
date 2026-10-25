-- Changes apply to Annapurna's own orders, not marketplace orders.
alter table public.order_settings add column if not exists closed_early_on date;
alter table public.orders add column if not exists takeaway_charge numeric(10,2) not null default 0 check (takeaway_charge>=0);
alter table public.order_items add column if not exists toppings text[];
alter table public.order_items add column if not exists toppings_extra numeric(10,2) not null default 0 check (toppings_extra>=0);

-- Pure helpers are private; they cannot be invoked through the public Data API.
create or replace function private.pizza_topping_price(item_category text, selected jsonb)
returns table(toppings text[], extra numeric)
language plpgsql immutable security invoker set search_path='' as $$
declare allowed text[]:=array['Capsicum','Onion','Green chilli','Tomato','Sweet corn','Jalapenos','Black olives','Pineapple'];
  n integer;
begin
  if position('pizza' in lower(coalesce(item_category,'')))=0 then
    if selected is not null and selected<>'[]'::jsonb then raise exception 'Toppings can only be selected for pizza or pizza khakhra'; end if;
    return query select null::text[],0::numeric;return;
  end if;
  if selected is null then raise exception 'Please refresh the app and choose toppings for each pizza before ordering'; end if;
  if jsonb_typeof(selected)<>'array' then raise exception 'Select toppings from the list'; end if;
  n:=jsonb_array_length(selected);
  if n>8 or exists(select 1 from jsonb_array_elements(selected) v where jsonb_typeof(v)<>'string') then raise exception 'Invalid toppings'; end if;
  if exists(select 1 from jsonb_array_elements_text(selected) v where not (v=any(allowed))) then raise exception 'Unknown topping'; end if;
  if (select count(distinct v) from jsonb_array_elements_text(selected) v)<>n then raise exception 'Choose each topping only once'; end if;
  return query select array(select a from unnest(allowed) a where selected ? a),greatest(n-5,0)*0.60;
end;$$;
revoke all on function private.pizza_topping_price(text,jsonb) from public,anon,authenticated;

create or replace function private.ordering_status_at(s public.order_settings, at_time timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare local_now timestamp; closed_today boolean; open_now boolean; next_open timestamptz;
begin
  local_now:=timezone(coalesce(s.shop_timezone,'Europe/London'),at_time);
  closed_today:=coalesce(s.closed_early_on=local_now::date,false);
  open_now:=coalesce(s.ordering_enabled,false) and not closed_today and local_now::time>=s.opens_at and local_now::time<s.closes_at;
  next_open:=case when not coalesce(s.ordering_enabled,false) then null
    when not closed_today and local_now::time<s.opens_at then (local_now::date+s.opens_at) at time zone coalesce(s.shop_timezone,'Europe/London')
    else (local_now::date+1+s.opens_at) at time zone coalesce(s.shop_timezone,'Europe/London') end;
  return jsonb_build_object('is_open',open_now,'closed_early',closed_today,'ordering_enabled',s.ordering_enabled,
    'opens_at',to_char(s.opens_at,'HH24:MI'),'closes_at',to_char(s.closes_at,'HH24:MI'),'timezone',s.shop_timezone,
    'local_time',to_char(local_now,'YYYY-MM-DD HH24:MI:SS'),'next_open_at',next_open);
end;$$;
revoke all on function private.ordering_status_at(public.order_settings,timestamptz) from public,anon,authenticated;

-- Preserve this existing public read-only RPC and its grants.
create or replace function public.shop_ordering_status()
returns jsonb language sql stable security definer set search_path='' as $$
  select private.ordering_status_at(s,now()) from public.order_settings s where id=1;
$$;

-- Admins may update only the temporary closure marker, not pricing/location/hours.
grant update(closed_early_on,updated_at) on public.order_settings to authenticated;
create policy "admins set temporary closure" on public.order_settings for update to authenticated
using (exists(select 1 from public.user_roles r where r.auth_user_id=(select auth.uid()) and r.role='ADMIN'))
with check (exists(select 1 from public.user_roles r where r.auth_user_id=(select auth.uid()) and r.role='ADMIN'));
create or replace function public.set_shop_closed_early(close_early boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.user_roles where auth_user_id=auth.uid() and role='ADMIN') then raise exception 'Administrator access required'; end if;
  if close_early is null then raise exception 'Choose whether to close early'; end if;
  update public.order_settings set closed_early_on=case when close_early then timezone(coalesce(shop_timezone,'Europe/London'),clock_timestamp())::date else null end,updated_at=clock_timestamp() where id=1;
  if not found then raise exception 'Ordering settings not found'; end if;
  return public.shop_ordering_status();
end;$$;
revoke all on function public.set_shop_closed_early(boolean) from public,anon;
grant execute on function public.set_shop_closed_early(boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.create_order(fulfilment_text text, customer_latitude numeric, customer_longitude numeric, cart_items jsonb, order_notes text, phone_verification_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  p public.customer_profiles%rowtype;
  settings public.order_settings%rowtype;
  local_now timestamp;
  local_time time;
  dist integer;
  oid uuid;
  ono bigint;
  v_added_subtotal numeric(10,2):=0;
  v_final_subtotal numeric(10,2):=0;
  v_final_total numeric(10,2):=0;
  it jsonb;
  mi public.menu_items%rowtype;
  qty integer;
  v_eta integer;
  v_intent uuid;
  v_customer_expected timestamptz;
  v_far boolean:=false;
  v_merge boolean:=false;
  v_existing_item uuid;
  v_item_notes text;
  v_toppings text[];
  v_toppings_extra numeric(10,2);
  v_unit_price numeric(10,2);
  v_takeaway_charge numeric(10,2);
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  select * into p from public.customer_profiles where auth_user_id=auth.uid();
  if p.customer_id is null then raise exception 'Customer profile not found'; end if;
  if p.mobile_number is null or p.mobile_verified_at is null then raise exception 'Please verify your mobile number before ordering'; end if;
  if nullif(btrim(coalesce(p.full_name,'')), '') is null then raise exception 'Please complete your name before ordering'; end if;

  -- The shared row lock serializes order acceptance against an admin closure update.
  select * into settings from public.order_settings where id=1 for share;
  if not coalesce(settings.ordering_enabled,false) then raise exception 'Ordering is currently unavailable'; end if;
  local_now := timezone(coalesce(settings.shop_timezone,'Europe/London'), clock_timestamp());
  local_time := local_now::time;
  if settings.closed_early_on=local_now::date then raise exception 'The restaurant has closed early today. Ordering reopens at the next scheduled opening'; end if;
  if local_time < settings.opens_at or local_time >= settings.closes_at then raise exception 'Online ordering is open from 10:00 AM to 10:00 PM'; end if;

  v_takeaway_charge:=case when fulfilment_text='TAKEAWAY' then 0.50 else 0 end;
  if fulfilment_text is null or fulfilment_text not in ('TAKEAWAY','EAT_HERE') then raise exception 'Choose takeaway or eating here'; end if;
  if customer_latitude is null or customer_longitude is null then raise exception 'Location is required to confirm collection arrangements'; end if;
  dist:=public.distance_meters(customer_latitude,customer_longitude,settings.shop_lat,settings.shop_lng);
  v_far:=dist>50;

  if v_far then
    select intent_id, customer_eta_minutes into v_intent, v_eta
    from private.order_collection_intents
    where auth_user_id=auth.uid() and consumed_at is null and expires_at>now()
    order by created_at desc limit 1 for update;
    if v_intent is null then raise exception 'You are more than 50 metres away. Confirm that you will collect the order and enter your collection time before ordering'; end if;
    v_customer_expected:=now()+make_interval(mins=>v_eta);
    update private.order_collection_intents set consumed_at=now() where intent_id=v_intent;
  end if;

  if cart_items is null or jsonb_typeof(cart_items)<>'array' or jsonb_array_length(cart_items)=0 then raise exception 'Cart is empty'; end if;
  if jsonb_array_length(cart_items)>40 then raise exception 'Too many cart lines'; end if;

  -- Serialize order creation per customer so two rapid taps/devices cannot race
  -- into two separate mergeable orders.
  perform pg_advisory_xact_lock(hashtext(p.customer_id::text)::bigint);

  -- Normal ASAP/no-promo orders from the same customer within 10 minutes are
  -- one visit and one order. Only NEW orders are merged so kitchen work already
  -- accepted/preparing is never silently changed.
  if coalesce(current_setting('app.disable_order_merge', true),'0') <> '1' then
    select o.order_id,o.order_number into oid,ono
    from public.orders o
    where o.customer_id=p.customer_id
      and o.status='NEW'
      and o.fulfilment=fulfilment_text::public.fulfilment_type
      and o.promo_code is null
      and o.scheduled_collection_at is null
      and o.created_at >= now()-interval '10 minutes'
    order by o.created_at desc
    limit 1
    for update;
    v_merge := oid is not null;
  end if;

  if not v_merge then
    insert into public.orders(customer_id,fulfilment,subtotal,total,notes,customer_lat,customer_lng,distance_m,last_updated_by,customer_phone,phone_reverified_at,far_order,customer_eta_minutes,customer_expected_at,takeaway_charge)
    values(p.customer_id,fulfilment_text::public.fulfilment_type,0,0,nullif(left(coalesce(order_notes,''),500),''),customer_latitude,customer_longitude,dist,auth.uid(),p.mobile_number,null,v_far,v_eta,v_customer_expected,v_takeaway_charge)
    returning order_id,order_number into oid,ono;
  end if;

  for it in select * from jsonb_array_elements(cart_items) loop
    qty:=greatest(1,least(50,coalesce((it->>'quantity')::integer,1)));
    select * into mi from public.menu_items where id=(it->>'menu_item_id')::uuid and listed=true and available=true;
    if mi.id is null then raise exception 'A menu item is sold out or unavailable'; end if;
    select * into v_toppings,v_toppings_extra from private.pizza_topping_price(mi.category,it->'toppings');
    v_unit_price:=mi.price+v_toppings_extra;
    v_item_notes:=nullif(left(coalesce(it->>'notes',''),200),'');
    v_added_subtotal:=v_added_subtotal+(v_unit_price*qty);

    v_existing_item:=null;
    if v_merge then
      select oi.order_item_id into v_existing_item
      from public.order_items oi
      where oi.order_id=oid
        and oi.menu_item_id=mi.id
        and oi.unit_price=v_unit_price
        and oi.toppings is not distinct from v_toppings
        and coalesce(oi.item_notes,'')=coalesce(v_item_notes,'')
      order by oi.order_item_id
      limit 1
      for update;
    end if;

    if v_existing_item is not null then
      update public.order_items
      set quantity=quantity+qty,
          line_total=unit_price*(quantity+qty)
      where order_item_id=v_existing_item;
    else
      insert into public.order_items(order_id,menu_item_id,item_name,unit_price,quantity,line_total,item_notes,toppings,toppings_extra)
      values(oid,mi.id,case when position('pizza' in lower(coalesce(mi.category,'')))>0 then regexp_replace(mi.name,'\s*\([^)]*\)\s*$','') else mi.name end,v_unit_price,qty,v_unit_price*qty,v_item_notes,v_toppings,v_toppings_extra);
    end if;
  end loop;

  if v_merge then
    update public.orders
    set subtotal=subtotal+v_added_subtotal,
        total=(subtotal+v_added_subtotal)-coalesce(discount_amount,0)+greatest(takeaway_charge,v_takeaway_charge),
        takeaway_charge=greatest(takeaway_charge,v_takeaway_charge),
        updated_at=now(),
        last_updated_by=auth.uid(),
        far_order=far_order or v_far,
        customer_eta_minutes=case when v_far then v_eta else customer_eta_minutes end,
        customer_expected_at=case when v_far then v_customer_expected else customer_expected_at end,
        notes=case
          when nullif(btrim(coalesce(order_notes,'')),'') is null then notes
          when nullif(btrim(coalesce(notes,'')),'') is null then left(order_notes,500)
          else left(notes || E'\nAdditional order: ' || order_notes,500)
        end
    where order_id=oid
    returning subtotal,total into v_final_subtotal,v_final_total;
  else
    update public.orders
    set subtotal=v_added_subtotal,total=v_added_subtotal+v_takeaway_charge
    where order_id=oid
    returning subtotal,total into v_final_subtotal,v_final_total;
    insert into public.order_status_history(order_id,from_status,to_status,changed_by)
    values(oid,null,'NEW',auth.uid());
  end if;

  return jsonb_build_object(
    'order_id',oid,
    'order_number',ono,
    'status','NEW',
    'subtotal',v_final_subtotal,
    'takeaway_charge',v_takeaway_charge,
    'total',v_final_total,
    'distance_m',dist,
    'far_order',v_far,
    'customer_eta_minutes',v_eta,
    'customer_expected_at',v_customer_expected,
    'merged',v_merge,
    'added_total',v_added_subtotal,
    'merge_window_minutes',10
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_order_v3(fulfilment_text text, customer_latitude numeric, customer_longitude numeric, cart_items jsonb, order_notes text DEFAULT NULL::text, promo_code text DEFAULT NULL::text, requested_collection_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  result jsonb; oid uuid; c uuid; v_subtotal numeric(10,2); disc numeric(10,2):=0;
  p public.promotions%rowtype; used integer; total_used integer;
  settings public.order_settings%rowtype; local_collection timestamp;
begin
  -- Promo/scheduled orders stay separate so discounts and collection times are
  -- never accidentally applied to an earlier basket.
  if requested_collection_at is not null or nullif(btrim(coalesce(promo_code,'')),'') is not null then
    perform set_config('app.disable_order_merge','1',true);
  end if;

  result := public.create_order(fulfilment_text,customer_latitude,customer_longitude,cart_items,order_notes,null::uuid);
  oid := (result->>'order_id')::uuid;
  v_subtotal := coalesce((result->>'subtotal')::numeric,(result->>'total')::numeric);
  select customer_id into c from public.orders where order_id=oid;

  if requested_collection_at is not null then
    if fulfilment_text <> 'TAKEAWAY' then raise exception 'Scheduled collection is available for takeaway orders only'; end if;
    if requested_collection_at < now()+interval '5 minutes' then raise exception 'Choose a collection time at least 5 minutes from now'; end if;
    if requested_collection_at > now()+interval '7 days' then raise exception 'Collection can be scheduled up to 7 days ahead'; end if;
    select * into settings from public.order_settings where id=1;
    local_collection := timezone(coalesce(settings.shop_timezone,'Europe/London'),requested_collection_at);
    if local_collection::time < settings.opens_at or local_collection::time >= settings.closes_at then raise exception 'Collection time must be between 10:00 AM and 10:00 PM'; end if;
    update public.orders set scheduled_collection_at=requested_collection_at,customer_expected_at=requested_collection_at where order_id=oid;
  end if;

  if nullif(btrim(coalesce(promo_code,'')),'') is not null then
    select * into p from public.promotions where upper(code)=upper(btrim(promo_code)) and active=true and starts_at<=now() and expires_at>now() for update;
    if p.promotion_id is null then raise exception 'This offer code is invalid or expired'; end if;
    if v_subtotal < p.min_spend then raise exception 'Minimum spend for this offer is £%', trim(to_char(p.min_spend,'999990.00')); end if;
    select count(*) into used from public.promotion_redemptions where promotion_id=p.promotion_id and customer_id=c;
    if used >= p.per_customer_limit then raise exception 'You have already used this offer'; end if;
    if p.max_uses is not null then
      select count(*) into total_used from public.promotion_redemptions where promotion_id=p.promotion_id;
      if total_used >= p.max_uses then raise exception 'This offer has reached its usage limit'; end if;
    end if;
    disc := case when p.discount_type='PERCENT' then round(v_subtotal*(p.discount_value/100.0),2) else p.discount_value end;
    disc := least(v_subtotal,disc);
    update public.orders set promo_code=p.code,discount_amount=disc,total=v_subtotal-disc+coalesce((result->>'takeaway_charge')::numeric,0) where order_id=oid;
    insert into public.promotion_redemptions(promotion_id,customer_id,order_id,discount_amount)
    values(p.promotion_id,c,oid,disc);
  end if;

  return result || jsonb_build_object(
    'subtotal',v_subtotal,
    'discount_amount',disc,
    'total',v_subtotal-disc+coalesce((result->>'takeaway_charge')::numeric,0),
    'promo_code',case when p.promotion_id is null then null else p.code end,
    'scheduled_collection_at',requested_collection_at
  );
end;
$function$;
