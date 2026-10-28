-- Secure Documents retention and Storage API purge controls.
-- Untrusted clients never write these fields. Separate reviewer-set grants are
-- required before the scheduler may remove any ciphertext.
alter table public.secure_document_records
  add column if not exists legal_hold boolean not null default true,
  add column if not exists retention_until timestamptz,
  add column if not exists purge_authorized_at timestamptz,
  add column if not exists backup_policy_reviewed_at timestamptz,
  add column if not exists purge_lease_until timestamptz,
  add column if not exists storage_purged_at timestamptz;
create index if not exists secure_document_purge_eligibility_idx
  on public.secure_document_records(retention_until, purge_authorized_at)
  where status='deletion_pending' and legal_hold=false and storage_purged_at is null;
create table if not exists public.secure_document_purge_receipts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.secure_document_records(id) on delete restrict,
  operation text not null check (operation in ('storage_api_purge')),
  result text not null check (result in ('storage_confirmed','retry_required')),
  file_count integer not null check(file_count >= 0 and file_count <= 10000),
  backup_erased boolean not null default false check (backup_erased = false),
  attempted_at timestamptz not null default now(),
  error_code text check (error_code is null or char_length(error_code) <= 50)
);
create index if not exists secure_document_purge_receipts_doc_idx
  on public.secure_document_purge_receipts(document_id, attempted_at desc);
alter table public.secure_document_purge_receipts enable row level security;
revoke all on table public.secure_document_purge_receipts from PUBLIC, anon, authenticated;
grant select, insert on table public.secure_document_purge_receipts to service_role;
comment on table public.secure_document_purge_receipts is
  'Storage API removal attestations only; backup_erased must remain false pending independently validated backup lifecycle.';
comment on column public.secure_document_records.legal_hold is
  'True by default: human-reviewed legal hold and retention controls must be satisfied before ciphertext purge.';
