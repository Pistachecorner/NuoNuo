# NuoNuo Customer History Final Fix

This patch is based on the stable NuoNuo customer website build.

It only fixes the customer order-history link:
- Uses the signed-in customer profile phone.
- Normalizes 017..., 6017..., and +6017... phone formats.
- Finds ALL matching Management customer rows.
- Reads ALL orders belonging to those customer rows.
- Returns diagnostics when the result is empty.
- Automatically opens order history when the customer opens their profile.

It does not modify menu, categories, product images, checkout pricing, or existing orders.

## Supabase
Run only `NUONUO_CUSTOMER_HISTORY_FINAL_FIX.sql` in a new SQL query.
Do not delete existing checkout/menu SQL.

## Website
Deploy the ZIP from this package. The customer profile will load order history automatically.
