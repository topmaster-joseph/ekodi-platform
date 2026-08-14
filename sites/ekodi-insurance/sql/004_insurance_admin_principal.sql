-- Central EKODI administrators are authenticated by api.ekodi.kr, not by the
-- isolated Insurance Supabase Auth. Store their verified central principal in
-- the Insurance audit trail without cloning central admin credentials/users.

alter table public.insurance_audit_events
  add column if not exists actor_principal text;

create index if not exists insurance_audit_actor_principal_idx
  on public.insurance_audit_events(actor_principal, created_at desc);

comment on column public.insurance_audit_events.actor_principal is
  'Verified external/admin principal such as central EKODI admin email. Never supplied directly by the browser; set only by a trusted internal API.';
