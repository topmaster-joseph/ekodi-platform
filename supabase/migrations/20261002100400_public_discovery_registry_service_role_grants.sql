revoke execute on function public.discovery_private_path(text) from public, anon, authenticated;
revoke execute on function public.discovery_remove_record(text, text) from public, anon, authenticated;
revoke execute on function public.discovery_upsert_public_record(text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, jsonb, timestamptz) from public, anon, authenticated;

grant execute on function public.discovery_private_path(text) to service_role;
grant execute on function public.discovery_remove_record(text, text) to service_role;
grant execute on function public.discovery_upsert_public_record(text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, jsonb, timestamptz) to service_role;
