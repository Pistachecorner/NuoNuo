-- NuoNuo public storefront menu access fix
-- IMPORTANT: This exposes ONLY public menu fields.
-- It does NOT grant anon access to the products/categories tables,
-- so calculated_cost, user_id and other management-only fields stay private.

create or replace function public.get_nuonuo_public_menu()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'sort_order', coalesce(c.sort_order, 0)
        ) order by coalesce(c.sort_order, 0), c.name
      )
      from public.categories c
      where c.user_id = '0d59b9c2-a3c1-4b28-b42f-228082819ade'::uuid
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'description', p.description,
          'selling_price', p.selling_price,
          'image_url', p.image_url,
          'category_id', p.category_id
        ) order by p.name
      )
      from public.products p
      where p.user_id = '0d59b9c2-a3c1-4b28-b42f-228082819ade'::uuid
        and coalesce(p.active, true) = true
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_nuonuo_public_menu() from public;
grant execute on function public.get_nuonuo_public_menu() to anon, authenticated;

-- Management uploads product photos to this bucket.
-- Make the bucket public so the existing image_url values render on the storefront.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Public storefront needs to READ product images, but still cannot upload/delete them.
drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read
on storage.objects for select
to public
using (bucket_id = 'product-images');
