-- NuoNuo Customer Rewards + Order History FINAL 2
-- Safe patch for the CURRENT stable storefront.
-- Does not touch products, categories, photos, menu RPC, or Management UI.
-- Adds customer order count + total spent + RM10 vouchers.
-- Reward rule: each qualifying RM100 order earns 1 x RM10 voucher.
-- Voucher: valid for 3 months and minimum spend RM50.

create extension if not exists pgcrypto;

create table if not exists public.nuonuo_customer_vouchers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  code text not null unique,
  amount numeric(12,2) not null default 10,
  minimum_spend numeric(12,2) not null default 50,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_nuonuo_vouchers_customer
on public.nuonuo_customer_vouchers(customer_id, expires_at);

alter table public.nuonuo_customer_vouchers enable row level security;
revoke all on public.nuonuo_customer_vouchers from anon, authenticated, public;

create or replace function public.nuonuo_normalize_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare v text := regexp_replace(coalesce(trim(p_phone), ''), '[^0-9+]', '', 'g');
begin
  if v = '' then return null; end if;
  if v like '+60%' then return '0' || substring(v from 4); end if;
  if v like '60%' then return '0' || substring(v from 3); end if;
  return v;
end;
$$;

-- One source of truth for history. It matches ALL Management customer rows
-- with the same normalized phone, then returns count + spending + orders.
create or replace function public.get_nuonuo_customer_order_history()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fallback_owner uuid := '0d59b9c2-a3c1-4b28-b42f-228082819ade';
  v_owner uuid;
  v_phone text;
  v_profile_found boolean := false;
  v_customer_count integer := 0;
  v_order_count integer := 0;
  v_total numeric(12,2) := 0;
  v_orders jsonb := '[]'::jsonb;
begin
  select p.owner_id, p.phone into v_owner, v_phone
  from public.nuonuo_customer_profiles p
  where p.auth_user_id = auth.uid()
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  v_profile_found := found;
  v_owner := coalesce(v_owner, v_fallback_owner);

  if nullif(trim(v_phone), '') is null then
    return jsonb_build_object(
      'orders','[]'::jsonb,
      'order_count',0,
      'total_spent',0,
      'diagnostics',jsonb_build_object(
        'profile_found',v_profile_found,
        'phone_found',false,
        'matching_customers',0,
        'matching_orders',0
      )
    );
  end if;

  select count(*) into v_customer_count
  from public.customers c
  where c.user_id=v_owner
    and public.nuonuo_normalize_phone(c.phone)=public.nuonuo_normalize_phone(v_phone);

  select count(*), coalesce(sum(coalesce(o.total,0)),0)
    into v_order_count, v_total
  from public.orders o
  where o.user_id=v_owner
    and o.customer_id in (
      select c.id from public.customers c
      where c.user_id=v_owner
        and public.nuonuo_normalize_phone(c.phone)=public.nuonuo_normalize_phone(v_phone)
    );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',o.id,
      'order_number',o.order_number,
      'created_at',o.created_at,
      'order_date',o.order_date,
      'status',o.status,
      'subtotal',coalesce(o.subtotal,0),
      'discount',coalesce(o.discount,0),
      'delivery_fee',coalesce(o.delivery_fee,0),
      'total',coalesce(o.total,0),
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'name',coalesce(p.name,'Item'),
          'quantity',oi.quantity,
          'unit_price',coalesce(oi.unit_price,0),
          'line_total',coalesce(oi.line_total,0)
        ) order by p.name)
        from public.order_items oi
        left join public.products p on p.id=oi.product_id
        where oi.order_id=o.id
      ),'[]'::jsonb)
    ) order by coalesce(o.order_date,o.created_at::date) desc,o.created_at desc
  ),'[]'::jsonb) into v_orders
  from public.orders o
  where o.user_id=v_owner
    and o.customer_id in (
      select c.id from public.customers c
      where c.user_id=v_owner
        and public.nuonuo_normalize_phone(c.phone)=public.nuonuo_normalize_phone(v_phone)
    );

  return jsonb_build_object(
    'orders',v_orders,
    'order_count',v_order_count,
    'total_spent',round(v_total,2),
    'diagnostics',jsonb_build_object(
      'profile_found',v_profile_found,
      'phone_found',true,
      'matching_customers',v_customer_count,
      'matching_orders',v_order_count
    )
  );
end;
$$;

-- Rewards summary also matches ALL duplicate Management customer rows.
create or replace function public.get_nuonuo_customer_rewards()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := '0d59b9c2-a3c1-4b28-b42f-228082819ade';
  v_phone text;
  v_customer_count integer := 0;
  v_order_count integer := 0;
  v_total numeric(12,2) := 0;
  v_vouchers jsonb := '[]'::jsonb;
begin
  select phone into v_phone
  from public.nuonuo_customer_profiles
  where auth_user_id=auth.uid() and owner_id=v_owner
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if nullif(trim(v_phone),'') is null then
    return jsonb_build_object('order_count',0,'total_spent',0,'vouchers','[]'::jsonb);
  end if;

  select count(*) into v_customer_count
  from public.customers c
  where c.user_id=v_owner
    and public.nuonuo_normalize_phone(c.phone)=public.nuonuo_normalize_phone(v_phone);

  select count(*),coalesce(sum(coalesce(o.total,0)),0)
    into v_order_count,v_total
  from public.orders o
  where o.user_id=v_owner
    and o.customer_id in (
      select c.id from public.customers c
      where c.user_id=v_owner
        and public.nuonuo_normalize_phone(c.phone)=public.nuonuo_normalize_phone(v_phone)
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'code',v.code,
    'amount',v.amount,
    'minimum_spend',v.minimum_spend,
    'issued_at',v.issued_at,
    'expires_at',v.expires_at,
    'used_at',v.used_at
  ) order by v.issued_at desc),'[]'::jsonb)
  into v_vouchers
  from public.nuonuo_customer_vouchers v
  where v.owner_id=v_owner
    and v.customer_id in (
      select c.id from public.customers c
      where c.user_id=v_owner
        and public.nuonuo_normalize_phone(c.phone)=public.nuonuo_normalize_phone(v_phone)
    )
    and (v.used_at is null or v.expires_at > now());

  return jsonb_build_object(
    'order_count',v_order_count,
    'total_spent',round(v_total,2),
    'matching_customers',v_customer_count,
    'vouchers',v_vouchers
  );
end;
$$;

create or replace function public.check_nuonuo_voucher(p_code text,p_subtotal numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := '0d59b9c2-a3c1-4b28-b42f-228082819ade';
  v_phone text;
  v_v public.nuonuo_customer_vouchers%rowtype;
begin
  if p_subtotal < 50 then
    return jsonb_build_object('valid',false,'message','Minimum spend is RM 50.');
  end if;

  select phone into v_phone
  from public.nuonuo_customer_profiles
  where auth_user_id=auth.uid() and owner_id=v_owner
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if nullif(trim(v_phone),'') is null then
    return jsonb_build_object('valid',false,'message','Please sign in to use a voucher.');
  end if;

  select * into v_v
  from public.nuonuo_customer_vouchers v
  where v.owner_id=v_owner
    and v.customer_id in (
      select c.id from public.customers c
      where c.user_id=v_owner
        and public.nuonuo_normalize_phone(c.phone)=public.nuonuo_normalize_phone(v_phone)
    )
    and upper(v.code)=upper(trim(p_code))
    and v.used_at is null
    and v.expires_at > now()
  limit 1;

  if not found then
    return jsonb_build_object('valid',false,'message','Voucher is invalid, expired, or already used.');
  end if;

  return jsonb_build_object('valid',true,'discount',least(v_v.amount,p_subtotal),'code',v_v.code);
end;
$$;

-- Reward-enabled checkout. It preserves the existing checkout RPC and adds
-- voucher redemption + new vouchers. One RM100 qualifying order = one RM10 voucher.
create or replace function public.place_nuonuo_public_order_rewards(
  p_name text,p_phone text,p_email text,p_address text,p_birthday date,
  p_fulfilment text,p_payment_method text,p_note text,p_order_date date,
  p_items jsonb,p_voucher_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := '0d59b9c2-a3c1-4b28-b42f-228082819ade';
  v_base jsonb;
  v_order_id uuid;
  v_customer_id uuid;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2):=0;
  v_net numeric(12,2);
  v_voucher public.nuonuo_customer_vouchers%rowtype;
  v_vouchers_earned integer:=0;
  i integer;
begin
  if auth.uid() is null then raise exception 'Please sign in to use customer rewards.'; end if;

  v_base:=public.place_nuonuo_public_order(
    p_name,p_phone,p_email,p_address,p_birthday,p_fulfilment,
    p_payment_method,p_note,p_order_date,p_items
  );

  v_order_id:=(v_base->>'order_id')::uuid;
  v_customer_id:=(v_base->>'customer_id')::uuid;
  v_subtotal:=(v_base->>'total')::numeric;

  if nullif(trim(coalesce(p_voucher_code,'')),'') is not null then
    select * into v_voucher
    from public.nuonuo_customer_vouchers
    where owner_id=v_owner
      and customer_id=v_customer_id
      and upper(code)=upper(trim(p_voucher_code))
      and used_at is null
      and expires_at>now()
    for update;

    if not found then raise exception 'Voucher is invalid, expired, or already used.'; end if;
    if v_subtotal<v_voucher.minimum_spend then raise exception 'Minimum spend for this voucher is RM 50.'; end if;

    v_discount:=least(v_voucher.amount,v_subtotal);
    update public.orders set discount=v_discount,total=round(v_subtotal-v_discount,2)
    where id=v_order_id and user_id=v_owner;

    update public.nuonuo_customer_vouchers set used_at=now(),used_order_id=v_order_id
    where id=v_voucher.id;
  end if;

  v_net:=round(v_subtotal-v_discount,2);
  v_vouchers_earned:=floor(v_net/100);

  for i in 1..v_vouchers_earned loop
    insert into public.nuonuo_customer_vouchers(
      owner_id,customer_id,order_id,code,amount,minimum_spend,expires_at
    ) values (
      v_owner,v_customer_id,v_order_id,
      'NUO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
      10,50,now()+interval '3 months'
    );
  end loop;

  return v_base||jsonb_build_object(
    'discount',v_discount,'total',v_net,'vouchers_earned',v_vouchers_earned
  );
end;
$$;

revoke all on function public.nuonuo_normalize_phone(text) from public;
revoke all on function public.get_nuonuo_customer_order_history() from public;
revoke all on function public.get_nuonuo_customer_rewards() from public;
revoke all on function public.check_nuonuo_voucher(text,numeric) from public;
revoke all on function public.place_nuonuo_public_order_rewards(text,text,text,text,date,text,text,text,date,jsonb,text) from public;

grant execute on function public.get_nuonuo_customer_order_history() to authenticated;
grant execute on function public.get_nuonuo_customer_rewards() to authenticated;
grant execute on function public.check_nuonuo_voucher(text,numeric) to authenticated;
grant execute on function public.place_nuonuo_public_order_rewards(text,text,text,text,date,text,text,text,date,jsonb,text) to authenticated;
