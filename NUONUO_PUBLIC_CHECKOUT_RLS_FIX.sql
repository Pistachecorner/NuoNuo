-- NuoNuo public checkout RLS fix
-- Guest customers are NOT auth.users, while public orders must still be
-- stored under the NuoNuo management owner. Do not weaken the customers /
-- orders RLS policies. Use one locked-down SECURITY DEFINER RPC instead.

create extension if not exists pgcrypto;

-- These columns are used by the current NuoNuo storefront. Add them only if
-- an older database version does not have them yet.
alter table public.customers add column if not exists sales_channel text;
alter table public.orders add column if not exists sales_channel text;
alter table public.orders add column if not exists order_type text;
alter table public.orders add column if not exists scheduled_date date;
alter table public.orders add column if not exists order_date date;

create or replace function public.place_nuonuo_public_order(
  p_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_birthday date,
  p_fulfilment text,
  p_payment_method text,
  p_note text,
  p_order_date date,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- NuoNuo Management owner. This is deliberately NOT accepted from the browser.
  v_owner uuid := '0d59b9c2-a3c1-4b28-b42f-228082819ade';
  v_customer_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_subtotal numeric(12,2) := 0;
  v_birthday_gift boolean := false;
  v_notes text;
  v_item jsonb;
  v_product record;
  v_qty numeric;
  v_line_total numeric(12,2);
begin
  if nullif(trim(p_name), '') is null then
    raise exception 'Name is required.';
  end if;
  if nullif(trim(p_phone), '') is null then
    raise exception 'Phone number is required.';
  end if;
  if lower(trim(coalesce(p_fulfilment, 'pickup'))) = 'delivery'
     and nullif(trim(p_address), '') is null then
    raise exception 'Address is required for delivery orders.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  v_birthday_gift := p_birthday is not null
    and extract(month from p_birthday) = extract(month from current_date);

  -- Reuse the existing customer by phone instead of creating duplicates on
  -- every website order. Guest customers are stored under the shop owner.
  select c.id into v_customer_id
  from public.customers c
  where c.user_id = v_owner
    and regexp_replace(coalesce(c.phone, ''), '[^0-9+]', '', 'g') =
        regexp_replace(trim(p_phone), '[^0-9+]', '', 'g')
  order by c.created_at asc
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      id, user_id, name, phone, email, birthday, address, notes, sales_channel
    ) values (
      gen_random_uuid(), v_owner, trim(p_name), trim(p_phone), nullif(trim(p_email), ''),
      p_birthday, nullif(trim(p_address), ''), 'Public website customer', 'nuonuo'
    )
    returning id into v_customer_id;
  else
    update public.customers
    set name = trim(p_name),
        phone = trim(p_phone),
        email = coalesce(nullif(trim(p_email), ''), email),
        birthday = coalesce(p_birthday, birthday),
        address = coalesce(nullif(trim(p_address), ''), address),
        sales_channel = 'nuonuo',
        updated_at = now()
    where id = v_customer_id and user_id = v_owner;
  end if;

  -- Validate products and calculate the price on the server. The browser
  -- cannot alter the price or submit another owner's product.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    if v_qty <= 0 or v_qty <> trunc(v_qty) or v_qty > 100 then
      raise exception 'Invalid item quantity.';
    end if;

    select p.id, p.selling_price, p.calculated_cost, p.name
      into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.user_id = v_owner
      and coalesce(p.active, true) = true
      and (p.sales_channel is null
           or lower(trim(p.sales_channel)) in ('nuonuo', 'nuonuo nationwide'));

    if not found then
      raise exception 'One of the selected products is no longer available.';
    end if;

    v_line_total := round(v_product.selling_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_order_number := 'WEB-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS');
  v_notes := concat_ws(
    ' | ',
    'Public website · ' || coalesce(nullif(trim(p_fulfilment), ''), 'Self pickup'),
    case when v_birthday_gift then '🎁 Birthday month gift eligible' else null end,
    nullif(trim(p_note), '')
  );

  insert into public.orders (
    id, user_id, customer_id, order_number, sales_channel, order_type,
    scheduled_date, order_date, status, subtotal, discount, delivery_fee,
    total, payment_status, payment_method, notes
  ) values (
    v_order_id, v_owner, v_customer_id, v_order_number, 'nuonuo', 'pre_order',
    coalesce(p_order_date, current_date), coalesce(p_order_date, current_date),
    'pending', v_subtotal, 0, 0, v_subtotal, 'unpaid',
    nullif(trim(p_payment_method), ''), v_notes
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;

    select p.id, p.selling_price, p.calculated_cost
      into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.user_id = v_owner;

    insert into public.order_items (
      user_id, order_id, product_id, quantity, unit_price, unit_cost,
      addons_total, line_total
    ) values (
      v_owner, v_order_id, v_product.id, v_qty, v_product.selling_price,
      v_product.calculated_cost, 0,
      round(v_product.selling_price * v_qty, 2)
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'customer_id', v_customer_id,
    'total', v_subtotal,
    'birthday_gift', v_birthday_gift
  );
end;
$$;

revoke all on function public.place_nuonuo_public_order(
  text, text, text, text, date, text, text, text, date, jsonb
) from public;

grant execute on function public.place_nuonuo_public_order(
  text, text, text, text, date, text, text, text, date, jsonb
) to anon, authenticated;

-- Keep direct table writes protected. Public checkout should use the RPC only.
-- No anon INSERT policy is added to customers/orders/order_items.
