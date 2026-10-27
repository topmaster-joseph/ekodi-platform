-- EKODI Secure Documents Core v1. Deliberately inactive until security gates pass.
-- The credential/password vault remains separate and still forbids government ID images.
create table if not exists public.secure_document_records (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null check (owner_scope in ('person','workspace')),
  owner_person_id uuid references public.people(id),
  workspace_id uuid references public.tenants(id),
  kind text not null check (kind in ('business_registration','bank_account_copy','organization_registration','license','other_redacted')),
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'active' check (status in ('active','archived','deletion_pending','deleted')),
  issued_on date,
  valid_until date,
  created_by_person_id uuid not null references public.people(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secure_document_owner_exactly_one check (
    (owner_scope='person' and owner_person_id is not null and workspace_id is null)
    or (owner_scope='workspace' and workspace_id is not null and owner_person_id is null)
  )
);
create index if not exists secure_document_person_idx on public.secure_document_records(owner_person_id,created_at desc) where owner_scope='person';
create index if not exists secure_document_workspace_idx on public.secure_document_records(workspace_id,created_at desc) where owner_scope='workspace';

create table if not exists public.secure_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.secure_document_records(id) on delete restrict,
  version_number integer not null check(version_number between 1 and 10000),
  storage_key text not null unique,
  mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg','image/webp')),
  size_bytes integer not null check(size_bytes between 1 and 5242880),
  cipher_sha256 text not null check(cipher_sha256 ~ '^[a-f0-9]{64}$'),
  cipher_metadata jsonb not null,
  redacted_for_sharing boolean not null default false,
  state text not null default 'active' check(state in ('active','replaced','deletion_pending','deleted')),
  created_by_person_id uuid not null references public.people(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(document_id,version_number)
);
create index if not exists secure_doc_versions_latest_idx on public.secure_document_versions(document_id,version_number desc);

create table if not exists public.secure_document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.secure_document_records(id) on delete restrict,
  version_id uuid not null references public.secure_document_versions(id) on delete restrict,
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  recipient_email_mac text not null check(recipient_email_mac ~ '^[a-f0-9]{64}$'),
  created_by_person_id uuid not null references public.people(id),
  expires_at timestamptz not null,
  max_views integer not null default 1 check(max_views between 1 and 10),
  view_count integer not null default 0 check(view_count >= 0 and view_count <= max_views),
  revoked_at timestamptz,
  status text not null default 'active' check(status in ('active','expired','revoked')),
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  constraint secure_doc_share_expiry_window check(expires_at > created_at and expires_at <= created_at+interval '7 days')
);
create index if not exists secure_doc_share_expiry_idx on public.secure_document_shares(expires_at) where status='active';
create index if not exists secure_doc_share_document_idx on public.secure_document_shares(document_id,created_at desc);

create table if not exists public.secure_document_access_audit (
  id bigint generated always as identity primary key,
  document_id uuid references public.secure_document_records(id),
  share_id uuid references public.secure_document_shares(id),
  actor_person_id uuid references public.people(id),
  event_type text not null check(event_type in ('created','listed','viewed','share_created','share_viewed','share_revoked','share_expired','upload_failed','deletion_requested','purged','denied')),
  status text not null check(status in ('success','denied','failed')),
  created_at timestamptz not null default now()
);
create index if not exists secure_doc_audit_doc_idx on public.secure_document_access_audit(document_id,created_at desc);
-- No client grants, no anon read, and no RLS policies. Trusted server only.
do $$
declare t text;
begin
  foreach t in array array['secure_document_records','secure_document_versions','secure_document_shares','secure_document_access_audit']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from PUBLIC, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to service_role',t);
  end loop;
end $$;
grant usage, select on sequence public.secure_document_access_audit_id_seq to service_role;
-- Service role is the only owner of this opaque ciphertext bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('secure-documents-private','secure-documents-private',false,6291456,array['application/octet-stream'])
on conflict (id) do update set public=false,file_size_limit=6291456,allowed_mime_types=array['application/octet-stream'];
-- storage.objects has NO bucket-wide client policies added. The service must
-- review any pre-existing overly broad storage.objects RLS grants before release.
comment on table public.secure_document_records is 'Person/workspace-scoped high-security document metadata. No human administrator gains implicit plaintext access.';
comment on table public.secure_document_shares is 'Recipient-bound, hashed, revocable and expiring secure-document grants; never expose raw tokens.';
