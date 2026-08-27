-- NuoNuo customer history link repair V2
-- IMPORTANT: this patch does NOT change Menu / photos / checkout UI.
-- It fixes a common legacy-data case where the same customer has more than
-- one Management customer row because phone formatting changed over time.
-- The website now reads orders across ALL matching customer rows.

create or replace function public.nuonuo_normalize_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  v text := regexp_replace(coalesce(trim(p_phone), ''), '[^0-9+]', '', 'g');
begin
  if v = '' then return null; end if;
  if v like '+60%' then return '0' || substring(v from 4); end if;
  if v like '60%' then return '0' || substring(v from 3); end if;
  return v;
end;
$$;

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
  v_orders jsonb;
begin
  -- Find the signed-in customer's profile. Prefer the profile's owner_id so
  -- this still works if the business owner ID changed in the Management app.
  select p.owner_id, p.phone
    into v_owner, v_phone
  from public.nuonuo_customer_profiles p
  where p.auth_user_id = auth.uid()
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  v_owner := coalesce(v_owner, v_fallback_owner);

  if nullif(trim(v_phone), '') is null then
    return jsonb_build_object('orders','[]'::jsonb);
  end if;

  -- DO NOT choose only the first customer row. A customer may have multiple
  -- legacy rows with the same phone but different formatting.
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
    ) order by coalesce(o.order_date, o.created_at::date) desc, o.created_at desc
  ),'[]'::jsonb)
  into v_orders
  from public.orders o
  where o.user_id=v_owner
    and o.customer_id in (
      select c.id
      from public.customers c
      where c.user_id=v_owner
        and public.nuonuo_normalize_phone(c.phone) = public.nuonuo_normalize_phone(v_phone)
    );

  return jsonb_build_object('orders',v_orders);
end;
$$;

create or replace function public.get_nuonuo_customer_rewards()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fallback_owner uuid := '0d59b9c2-a3c1-4b28-b42f-228082819ade';
  v_owner uuid;
  v_phone text;
  v_order_count integer := 0;
  v_total numeric(12,2) := 0;
  v_vouchers jsonb;
begin
  select p.owner_id, p.phone
    into v_owner, v_phone
  from public.nuonuo_customer_profiles p
  where p.auth_user_id = auth.uid()
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  v_owner := coalesce(v_owner, v_fallback_owner);

  if nullif(trim(v_phone), '') is null then
    return jsonb_build_object('order_count',0,'total_spent',0,'vouchers','[]'::jsonb);
  end if;

  select count(*), coalesce(sum(coalesce(o.total,0)),0)
    into v_order_count, v_total
  from public.orders o
  where o.user_id=v_owner
    and o.customer_id in (
      select c.id
      from public.customers c
      where c.user_id=v_owner
        and public.nuonuo_normalize_phone(c.phone) = public.nuonuo_normalize_phone(v_phone)
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
      select c.id
      from public.customers c
      where c.user_id=v_owner
        and public.nuonuo_normalize_phone(c.phone) = public.nuonuo_normalize_phone(v_phone)
    )
    and (v.used_at is null or v.expires_at > now());

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
