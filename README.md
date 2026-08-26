# NuoNuo Public Ordering Website V2

Customer-facing NuoNuo storefront connected to the existing Nuonuo Management Supabase database.

## Important
The current management schema uses `active`, `calculated_cost`, `categories`, `products`, `customers`, `orders`, and `order_items`. V1 incorrectly assumed `sales_channel` and several order columns already existed. V2 includes a migration that adds the required storefront fields and RLS policies.

## Setup
1. Put the same Supabase Project URL and anon/publishable key into `config.js`.
2. Put the Nuonuo Management Auth user's UUID into `NUONUO_STORE_OWNER_ID`.
3. Run `NUONUO_PUBLIC_STORE_RLS.sql` in Supabase SQL Editor.
4. In the SQL file, replace `YOUR-OWNER-UUID` with the same Auth user UUID and run that INSERT/UPSERT line.
5. Deploy the folder as the public NuoNuo website.

The public browser never uses a service-role key. The storefront only exposes active NuoNuo products/categories and only allows anonymous creation of pending unpaid NuoNuo orders.
