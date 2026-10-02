revoke references, trigger, truncate on table public.public_discovery_registry from anon, authenticated;
grant select, insert, update, delete on table public.public_discovery_registry to service_role;

alter function public.sync_activity_discovery() security definer;
alter function public.sync_trade_product_discovery() security definer;
alter function public.sync_store_profile_discovery() security definer;

revoke execute on function public.sync_activity_discovery() from public, anon, authenticated;
revoke execute on function public.sync_trade_product_discovery() from public, anon, authenticated;
revoke execute on function public.sync_store_profile_discovery() from public, anon, authenticated;

grant execute on function public.sync_activity_discovery() to service_role;
grant execute on function public.sync_trade_product_discovery() to service_role;
grant execute on function public.sync_store_profile_discovery() to service_role;
