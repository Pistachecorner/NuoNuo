# NuoNuo customer storefront - connected menu fix

This build reads the live NuoNuo Management menu through a locked Supabase RPC:
- `get_nuonuo_public_menu()` reads the same `categories` and `products` records used by Management.
- Only public fields are returned: category id/name/order, product id/name/description/price/image/category.
- Management-only fields such as `calculated_cost` and `user_id` are NOT exposed to anonymous customers.
- Product photos are served from the same `product-images` storage bucket used by Management.

Menu behavior:
- one product per row
- no `All` option
- Categories dropdown controls which category is shown
- category cards use the live Management product images

IMPORTANT: run `NUONUO_PUBLIC_MENU_ACCESS_FIX.sql` once in Supabase SQL Editor before deploying this build. Do not delete the previous checkout/profile SQL files.
