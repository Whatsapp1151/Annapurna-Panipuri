-- Monthly visit reward selection and immutable earned rewards.
lock table public.visit_rewards in share row exclusive mode;
create table public.monthly_visit_reward_items (
 reward_month date primary key,
 menu_item_id uuid references public.menu_items(id) on delete set null,
 item_name text not null,
 item_price numeric not null check(item_price>0 and item_price<3),
 selected_at timestamptz not null default now()
);
alter table public.monthly_visit_reward_items enable row level security;
grant select on public.monthly_visit_reward_items to anon,authenticated;
create policy monthly_reward_read on public.monthly_visit_reward_items for select to anon,authenticated using(true);
create table public.earned_visit_rewards (
 reward_id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customer_profiles(customer_id) on delete cascade,
 reward_month date not null,
 item_name text,
 menu_item_id uuid references public.menu_items(id) on delete set null,
 earned_at timestamptz not null default now(),
 redeemed_at timestamptz,
 redeemed_by uuid
);
create index earned_visit_rewards_customer_pending on public.earned_visit_rewards(customer_id,earned_at) where redeemed_at is null;
alter table public.earned_visit_rewards enable row level security;
grant select on public.earned_visit_rewards to authenticated;
create policy earned_reward_read on public.earned_visit_rewards for select to authenticated using(public.is_staff() or exists(select 1 from public.customer_profiles cp where cp.customer_id=earned_visit_rewards.customer_id and cp.auth_user_id=(select auth.uid())));
-- October/current launch month keeps the existing offer. Future months rotate.
insert into public.monthly_visit_reward_items(reward_month,menu_item_id,item_name,item_price)
select date_trunc('month',timezone('Europe/London',now()))::date,id,name,price from public.menu_items where lower(name)='panipuri' and price>0 and price<3 limit 1;
insert into public.earned_visit_rewards(customer_id,reward_month,item_name,menu_item_id,earned_at)
select v.customer_id,date_trunc('month',timezone('Europe/London',now()))::date,'Panipuri',(select id from public.menu_items where lower(name)='panipuri' limit 1),v.updated_at
from public.visit_rewards v cross join lateral generate_series(1,v.free_panipuri_available);
alter table public.visit_reward_redemptions add column reward_id uuid references public.earned_visit_rewards(reward_id),add column item_name text;
alter table public.visit_reward_redemptions drop constraint visit_reward_redemptions_reward_type_check;
alter table public.visit_reward_redemptions add constraint visit_reward_redemptions_reward_type_check check(reward_type in ('FREE_PANIPURI','MONTHLY_VISIT_REWARD'));
create unique index visit_reward_redemption_once on public.visit_reward_redemptions(reward_id) where reward_id is not null;
create or replace function private.ensure_monthly_visit_reward() returns void language plpgsql security invoker set search_path='' as $$
declare m date:=date_trunc('month',timezone('Europe/London',now()))::date; chosen public.monthly_visit_reward_items; previous uuid;
begin
 perform pg_advisory_xact_lock(771927341);
 select * into chosen from public.monthly_visit_reward_items where reward_month=m;
 if not found then
  select menu_item_id into previous from public.monthly_visit_reward_items where reward_month<m order by reward_month desc limit 1;
  insert into public.monthly_visit_reward_items(reward_month,menu_item_id,item_name,item_price)
  select m,id,name,price from public.menu_items where listed is not false and available is true and price>0 and price<3 and lower(trim(category)) not in ('extras','add-ons','addons','add ons')
  order by case when id=previous then 1 else 0 end,random() limit 1 returning * into chosen;
 end if;
 -- If the menu temporarily had no eligible item, keep the earned voucher and
 -- assign it when a valid choice becomes available; never interrupt purchases.
 if chosen.item_name is not null then
  update public.earned_visit_rewards set item_name=chosen.item_name,menu_item_id=chosen.menu_item_id where item_name is null and redeemed_at is null;
 end if;
end $$;
revoke all on function private.ensure_monthly_visit_reward() from public,anon,authenticated;
create or replace function private.capture_earned_visit_reward() returns trigger language plpgsql security definer set search_path='' as $$
declare increase integer; m date:=date_trunc('month',timezone('Europe/London',now()))::date;
begin
 increase:=new.free_panipuri_available-case when tg_op='INSERT' then 0 else old.free_panipuri_available end;
 if increase>0 then
  perform private.ensure_monthly_visit_reward();
  insert into public.earned_visit_rewards(customer_id,reward_month,item_name,menu_item_id)
  select new.customer_id,m,c.item_name,c.menu_item_id from generate_series(1,increase) g left join public.monthly_visit_reward_items c on c.reward_month=m;
 end if;
 return new;
end $$;
revoke all on function private.capture_earned_visit_reward() from public,anon,authenticated;
create trigger capture_monthly_visit_reward after insert or update of free_panipuri_available on public.visit_rewards for each row execute function private.capture_earned_visit_reward();
create or replace function public.staff_redeem_monthly_visit_reward(target_customer uuid,target_reward uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.earned_visit_rewards; remaining integer;
begin
 if not public.is_staff() then raise exception 'Not authorised'; end if;
 -- Match the award functions' customer lock, then lock the counter before ledger.
 perform pg_advisory_xact_lock(hashtext(target_customer::text)::bigint);
 perform 1 from public.visit_rewards where customer_id=target_customer for update;
 select * into r from public.earned_visit_rewards where reward_id=target_reward and customer_id=target_customer and redeemed_at is null for update;
 if not found then raise exception 'This reward is unavailable or already redeemed'; end if;
 if r.item_name is null then raise exception 'No eligible menu item is currently available. The reward is saved; please try later.'; end if;
 update public.visit_rewards set free_panipuri_available=free_panipuri_available-1,updated_at=now() where customer_id=target_customer and free_panipuri_available>0 returning free_panipuri_available into remaining;
 if remaining is null then raise exception 'No reward available'; end if;
 update public.earned_visit_rewards set redeemed_at=now(),redeemed_by=auth.uid() where reward_id=r.reward_id;
 insert into public.visit_reward_redemptions(customer_id,redeemed_by,reward_type,reward_id,item_name) values(target_customer,auth.uid(),'MONTHLY_VISIT_REWARD',r.reward_id,r.item_name);
 return jsonb_build_object('customer_id',target_customer,'free_panipuri_available',remaining,'item_name',r.item_name);
end $$;
revoke all on function public.staff_redeem_monthly_visit_reward(uuid,uuid) from public,anon;
grant execute on function public.staff_redeem_monthly_visit_reward(uuid,uuid) to authenticated;
create or replace function public.staff_redeem_visit_reward(target_customer uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if not public.is_staff() then raise exception 'Not authorised'; end if;
 perform pg_advisory_xact_lock(hashtext(target_customer::text)::bigint);
 select reward_id into rid from public.earned_visit_rewards where customer_id=target_customer and redeemed_at is null order by earned_at,reward_id limit 1;
 return public.staff_redeem_monthly_visit_reward(target_customer,rid);
end $$;
revoke all on function public.staff_redeem_visit_reward(uuid) from public,anon;
grant execute on function public.staff_redeem_visit_reward(uuid) to authenticated;
select cron.schedule('annapurna-monthly-visit-reward','* * * * *','select private.ensure_monthly_visit_reward()');
select private.ensure_monthly_visit_reward();
