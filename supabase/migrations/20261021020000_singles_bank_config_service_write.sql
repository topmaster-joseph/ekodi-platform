-- Singles bank configuration writes (PUT /bank/admin/config) need service_role
-- INSERT/UPDATE on settings and plans. 20261009224000 granted SELECT only, so
-- config saves failed with a privilege error. Browser roles stay revoked; the
-- Edge function still gates writes on can_configure and forces active=false.
grant select,insert,update on table public.singles_bank_settings,public.singles_bank_plans to service_role;
