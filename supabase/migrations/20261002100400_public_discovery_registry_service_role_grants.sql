grant execute on function public.discovery_private_path(text)
to service_role;

grant execute on function public.discovery_upsert_public_record(
  text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,jsonb,timestamptz
) to service_role;

grant execute on function public.discovery_remove_record(text,text)
to service_role;

grant execute on function public.sync_activity_discovery()
to service_role;

grant execute on function public.sync_trade_product_discovery()
to service_role;

grant execute on function public.sync_store_profile_discovery()
to service_role;
