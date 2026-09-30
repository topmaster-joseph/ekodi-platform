-- The activity-context RPC is intentionally callable by signed-in users only.
revoke execute on function public.current_site_activity_contexts() from anon;
revoke execute on function public.current_site_activity_contexts() from public;
grant execute on function public.current_site_activity_contexts() to authenticated;
grant execute on function public.current_site_activity_contexts() to service_role;
