alter table public.menu_items add column if not exists takeaway_only boolean not null default false;
update public.menu_items set takeaway_only=true,updated_at=now()
where lower(name) in ('panipuri family pack','ragdapuri family pack','family pack panipuri','family pack ragdapuri');

-- Patch the existing shared order validator without changing its authorization,
-- pricing, opening-hours, location, promotion or merge behavior.
do $migration$
declare
  definition text;
  anchor text := 'if jsonb_array_length(cart_items)>40 then raise exception ''Too many cart lines''; end if;';
  guard text := $guard$
  if fulfilment_text <> 'TAKEAWAY' and exists (
    select 1 from jsonb_array_elements(cart_items) line
    join public.menu_items m on m.id=(line->>'menu_item_id')::uuid
    where m.takeaway_only
  ) then
    raise exception 'Family packs are available for takeaway only.';
  end if;
$guard$;
begin
  definition:=pg_get_functiondef('public.create_order(text,numeric,numeric,jsonb,text,uuid)'::regprocedure);
  if position('where m.takeaway_only' in definition)=0 then
    if position(anchor in definition)=0 then raise exception 'Order validator changed; review before applying takeaway restriction'; end if;
    execute replace(definition,anchor,anchor||E'\n'||guard);
  end if;
end;
$migration$;
