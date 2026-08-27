# NuoNuo Public Website → Management Customer Sync

## What this does
When a customer places an order on the public NuoNuo website, the checkout RPC automatically creates or updates that customer in the Management `customers` table.

Synced fields:
- Name (required)
- Phone (required)
- Address (required only for delivery orders; optional for pickup/profile)
- Email (optional)
- Birthday (optional)

## Duplicate prevention
Customers are matched by phone number under the NuoNuo owner account.
- Existing phone → update the existing customer record.
- New phone → create a new customer record.

This prevents a new customer row from being created every time the same customer orders.

## Security
The browser does NOT receive direct write access to `customers`, `orders`, or `order_items`.
The public website calls the locked `place_nuonuo_public_order(...)` SECURITY DEFINER RPC, which stores the data under the fixed NuoNuo Management owner.

## Required Supabase step
Run `NUONUO_PUBLIC_CHECKOUT_RLS_FIX.sql` once in the Supabase SQL Editor.

Do NOT add an anonymous INSERT policy to `customers` or `orders`.
