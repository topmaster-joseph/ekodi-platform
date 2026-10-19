-- Event data retention: run through EKODI-approved migration and scheduler.
-- No public execution grants. The production schedule must be registered and verified separately.
create or replace function public.motor_festival_2026_purge_expired()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare removed_count integer;
begin
  delete from public.motor_festival_2026_applications where expires_at <= now();
  get diagnostics removed_count = row_count;
  delete from public.motor_festival_2026_rate_limits where window_start < now() - interval '48 hours';
  return removed_count;
end;
$$;
revoke all on function public.motor_festival_2026_purge_expired() from public,anon,authenticated;
grant execute on function public.motor_festival_2026_purge_expired() to service_role;
