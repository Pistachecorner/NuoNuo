# NuoNuo Public Ordering Website

Customer-facing NuoNuo storefront connected to the existing Supabase database.

## Fix in this build
- Restored product/category loading without assuming the channel is spelled exactly `nuonuo`.
- Supports channel values such as `nuonuo`, `nuonuo_local`, and `NuoNuo · Local`.
- Keeps the public storefront restricted to NuoNuo-channel rows in the browser, with Supabase RLS remaining the security boundary.
- Restores product images in the category cards, hero, and menu.
- The menu is intentionally empty on first load. Customers must click a category before products appear.
- No Management pages, owner data, orders, recipes, costs, or staff data are exposed by the public UI.

## Setup
1. Keep the same Supabase Project URL and anon/publishable key in `config.js`.
2. Keep `NUONUO_STORE_OWNER_ID` set to the NuoNuo Management owner's Auth UUID.
3. Keep the NuoNuo public-store RLS policies enabled in Supabase.
4. Deploy the folder to Vercel.
