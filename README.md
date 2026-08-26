# NuoNuo Public Ordering Website V1

Customer-facing NuoNuo storefront. It reads the NuoNuo menu from the same Supabase database and creates customers, orders and order_items with `sales_channel = 'nuonuo'`, so orders are designed to appear in the existing Management System.

## Setup
1. Put the same Supabase URL and anon/publishable key into `config.js`.
2. Put the shared Pistaché Corner owner UUID into `NUONUO_STORE_OWNER_ID`.
3. Add tightly scoped anonymous RLS policies for public NuoNuo menu reads and order creation. Do not use a service-role key in the browser.
4. Deploy this folder as a separate public site.

The first version intentionally keeps payment as a recorded payment method/status. Online payment gateway can be added after the ordering flow is confirmed.
