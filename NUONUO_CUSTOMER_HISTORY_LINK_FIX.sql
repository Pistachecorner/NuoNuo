-- NuoNuo customer history link repair
-- SAFE PATCH: keeps the existing storefront UI and checkout flow intact.
-- Fixes Malaysian phone formatting differences such as 017... vs +6017...
-- so an existing Management customer can see their previous website orders.

create or replace function public.nuonuo_normalize_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  v text := regexp_replace(coalesce(trim(p_phone), ''), '[^0-9+]', '', 'g');
begin
  if v = '' then return null; end if;
  if v like '+60%' then
    return '0' || substring(v from 4);
  elsif v like '60%' then
    return '0' || substring(v from 3);
  end if;
  return v;
end;
$$;

-- Repair customer profile -> Management customer matching.
create or replace function public.get_nuonuo_customer_order_history()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := '0d59b9c2-a3c1-4b28-b42f-228082819ade';
  v_phone text;
  v_customer_id uuid;
  v_orders jsonb;
begin
  select phone into v_phone
  from public.nuonuo_customer_profiles
  where auth_user_id = auth.uid() and owner_id = v_owner
  limit 1;

  if nullif(trim(v_phone), '') is null then
    return jsonb_build_object('orders','[]'::jsonb);
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.user_id = v_owner
    and public.nuonuo_normalize_phone(c.phone) = public.nuonuo_normalize_phone(v_phone)
  order by c.created_at asc
  limit 1;

  if v_customer_id is null then
    return jsonb_build_object('orders','[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',o.id,
      'order_number',o.order_number,
      'created_at',o.created_at,
      'status',o.status,
      'subtotal',coalesce(o.subtotal,0),
      'discount',coalesce(o.discount,0),
      'total',coalesce(o.total,0),
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'name',coalesce(p.name,'Item'),
          'quantity',oi.quantity,
          'line_total',oi.line_total
        ) order by p.name)
        from public.order_items oi
        left join public.products p on p.id=oi.product_id
        where oi.order_id=o.id
      ),'[]'::jsonb)
    ) order by o.created_at desc
  ),'[]'::jsonb)
  into v_orders
  from public.orders o
  where o.user_id=v_owner and o.customer_id=v_customer_id;

  return jsonb_build_object('orders',v_orders);
end;
$$;

-- Keep rewards totals linked to the same Management customer.
create or replace function public.get_nuonuo_customer_rewards()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := '0d59b9c2-a3c1-4b28-b42f-228082819ade';
  v_phone text;
  v_customer_id uuid;
  v_order_count integer := 0;
  v_total numeric(12,2) := 0;
  v_vouchers jsonb;
begin
  select phone into v_phone
  from public.nuonuo_customer_profiles
  where auth_user_id=auth.uid() and owner_id=v_owner
  limit 1;

  if nullif(trim(v_phone), '') is null then
    return jsonb_build_object('order_count',0,'total_spent',0,'vouchers','[]'::jsonb);
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.user_id=v_owner
    and public.nuonuo_normalize_phone(c.phone)=public.nuonuo_normalize_phone(v_phone)
  order by c.created_at asc limit 1;

  if v_customer_id is null then
    return jsonb_build_object('order_count',0,'total_spent',0,'vouchers','[]'::jsonb);
  end if;

  select count(*), coalesce(sum(coalesce(total,0)),0)
    into v_order_count,v_total
  from public.orders
  where user_id=v_owner and customer_id=v_customer_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code',code,'amount',amount,'minimum_spend',minimum_spend,
    'issued_at',issued_at,'expires_at',expires_at,'used_at',used_at
    ) order by issued_at desc),'[]'::jsonb)
    into v_vouchers
  from public.nuonuo_customer_vouchers
  where owner_id=v_owner and customer_id=v_customer_id
    and (used_at is null or expires_at > now());

  return jsonb_build_object(
    'order_count',v_order_count,
    'total_spent',v_total,
    'vouchers',v_vouchers
  );
end;
$$;

revoke all on function public.get_nuonuo_customer_order_history() from public;
revoke all on function public.get_nuonuo_customer_rewards() from public;
grant execute on function public.get_nuonuo_customer_order_history() to authenticated;
grant execute on function public.get_nuonuo_customer_rewards() to authenticated;

-- IMPORTANT: the existing checkout RPC is deliberately left unchanged here.
-- This patch only repairs the read-side customer/history/rewards matching.
