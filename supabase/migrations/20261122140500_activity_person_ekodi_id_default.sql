-- Align the activity Person factory across DEV/PROD. Production already has this
-- default; development may have a legacy NOT NULL ekodi_id without a default.
-- Safe and additive: no existing user/person records are modified.
alter table public.people alter column ekodi_id
  set default ('EKD-'::text || upper(replace((gen_random_uuid())::text, '-'::text, ''::text)));
