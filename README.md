# NuoNuo Customer Store

This build keeps the customer storefront isolated from NuoNuo Management.

## Important deployment setting
The browser needs the public Supabase Project URL and public anon/publishable key.

You can either:
1. Put them in `config.js`, or
2. In Vercel, add these environment variables and redeploy:
   - `NUONUO_STORE_SUPABASE_URL`
   - `NUONUO_STORE_SUPABASE_ANON_KEY`

Only the public anon/publishable key is allowed. Never put a service-role key in the customer website.

## What was fixed in this build
- The customer app no longer creates a Supabase client from placeholder values before configuration is loaded.
- Vercel `/api/config` can provide the public browser config.
- The first NuoNuo menu category opens automatically, so the menu is not left blank.
- Product/category images support both full URLs and paths inside the `nuonuo-images` public bucket.
- Customer phone/password + Me profile flow remains unchanged.


## SAFE rewards add-on
This build is based on CUSTOMER_PROFILE_V4 and intentionally leaves the existing storefront menu loader and layout unchanged.

Optional SQL:
`NUONUO_CUSTOMER_REWARDS_SAFE.sql`

Run that SQL only after confirming the storefront still shows the original menu. If the rewards SQL is not installed, menu and the original checkout flow continue to work; rewards/order-history UI simply stays unavailable.
