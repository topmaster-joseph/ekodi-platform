revoke execute on function public.discovery_upsert_public_record(
  text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,jsonb,timestamptz
) from public, anon, authenticated;

revoke execute on function public.discovery_remove_record(text,text)
from public, anon, authenticated;

revoke execute on function public.sync_activity_discovery()
from public, anon, authenticated;

revoke execute on function public.sync_trade_product_discovery()
from public, anon, authenticated;

revoke execute on function public.sync_store_profile_discovery()
from public, anon, authenticated;
