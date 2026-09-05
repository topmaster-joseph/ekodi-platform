-- Public-safe route classification for automatically provisioned store admin spaces.
-- It exposes only the already-public operating slug and store display name.
create or replace function public.store_admin_route_profile(p_operating_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', s.operating_space_slug,
    'name', s.name
  )
  from public.stores s
  where lower(s.operating_space_slug) = lower(trim(coalesce(p_operating_slug,'')))
    and nullif(trim(s.operating_space_slug),'') is not null
  limit 1
$$;

revoke all on function public.store_admin_route_profile(text) from public;
grant execute on function public.store_admin_route_profile(text) to anon, authenticated;

comment on function public.store_admin_route_profile(text) is
  'Public-safe store admin route classifier. Returns only public route identity; private data remains behind store RLS.';
