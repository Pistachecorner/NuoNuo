-- NuoNuo customer history FINAL FIX
-- Safe patch for the existing stable customer storefront.
-- Does NOT change products, categories, photos, menu RPC, checkout UI, or orders.
-- It fixes customer/order linking and returns diagnostics when no history is found.

create extension if not exists pgcrypto;

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
  v_profile_found boolean := false;
  v_customer_count integer := 0;
  v_order_count integer := 0;
  v_orders jsonb := '[]'::jsonb;
begin
  -- The signed-in account is the source of truth for the customer's phone.
  select p.owner_id, p.phone
    into v_owner, v_phone
  from public.nuonuo_customer_profiles p
  where p.auth_user_id = auth.uid()
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  v_profile_found := found;
  v_owner := coalesce(v_owner, v_fallback_owner);

  if nullif(trim(v_phone), '') is null then
    return jsonb_build_object(
      'orders', '[]'::jsonb,
      'diagnostics', jsonb_build_object(
        'profile_found', v_profile_found,
        'phone_found', false,
        'matching_customers', 0,
        'matching_orders', 0
      )
    );
  end if;

  -- Match the Management customer by normalized phone. This handles
  -- 017..., 6017..., +6017..., spaces, and dashes as the same number.
  select count(*)
    into v_customer_count
  from public.customers c
  where c.user_id = v_owner
    and public.nuonuo_normalize_phone(c.phone) = public.nuonuo_normalize_phone(v_phone);

  -- IMPORTANT: use every matching customer row, not only the first row.
  -- Older Management data may contain duplicate customer records.
  select count(*)
    into v_order_count
  from public.orders o
  where o.user_id = v_owner
    and o.customer_id in (
      select c.id
      from public.customers c
      where c.user_id = v_owner
        and public.nuonuo_normalize_phone(c.phone) = public.nuonuo_normalize_phone(v_phone)
    );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'created_at', o.created_at,
      'order_date', o.order_date,
      'status', o.status,
      'subtotal', coalesce(o.subtotal, 0),
      'discount', coalesce(o.discount, 0),
      'delivery_fee', coalesce(o.delivery_fee, 0),
      'total', coalesce(o.total, 0),
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', coalesce(p.name, 'Item'),
            'quantity', oi.quantity,
            'unit_price', coalesce(oi.unit_price, 0),
            'line_total', coalesce(oi.line_total, 0)
          ) order by p.name
        )
        from public.order_items oi
        left join public.products p on p.id = oi.product_id
        where oi.order_id = o.id
      ), '[]'::jsonb)
    ) order by coalesce(o.order_date, o.created_at::date) desc, o.created_at desc
  ), '[]'::jsonb)
    into v_orders
  from public.orders o
  where o.user_id = v_owner
    and o.customer_id in (
      select c.id
      from public.customers c
      where c.user_id = v_owner
        and public.nuonuo_normalize_phone(c.phone) = public.nuonuo_normalize_phone(v_phone)
    );

  return jsonb_build_object(
    'orders', v_orders,
    'diagnostics', jsonb_build_object(
      'profile_found', v_profile_found,
      'phone_found', true,
      'matching_customers', v_customer_count,
      'matching_orders', v_order_count
    )
  );
end;
$$;

revoke all on function public.get_nuonuo_customer_order_history() from public;
grant execute on function public.get_nuonuo_customer_order_history() to authenticated;
