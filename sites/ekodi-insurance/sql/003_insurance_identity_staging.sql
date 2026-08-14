-- EKODI Insurance identity challenge store.
-- Service-role only. Browser clients receive only the raw one-time nonce;
-- the database stores its SHA-256 hash and expiration.

create table if not exists public.insurance_identity_challenges (
  nonce_hash text primary key check (nonce_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists insurance_identity_challenges_expiry_idx
  on public.insurance_identity_challenges(expires_at);

alter table public.insurance_identity_challenges enable row level security;

revoke all on table public.insurance_identity_challenges from anon, authenticated;

-- No RLS policies are intentionally defined.
-- Only service-role operations from the isolated identity Edge Function are allowed.
