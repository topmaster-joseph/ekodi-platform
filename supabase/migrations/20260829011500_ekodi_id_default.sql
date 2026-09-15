-- Keep legacy inserts compatible: callers may omit ekodi_id and still receive
-- a stable, opaque, non-PII EKODI public identifier.

alter table public.people
  alter column ekodi_id
  set default ('EKD-' || upper(replace(gen_random_uuid()::text, '-', '')));

comment on column public.people.ekodi_id is
  'Stable opaque EKODI public identity. Generated independently of login provider, email, and provider subject.';
