-- EKODI Insurance isolated schema draft for a Supabase development branch.
-- Do not apply directly to production without branch QA and security advisor review.

create table if not exists public.insurance_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','advisor','auditor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.insurance_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'ko-KR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  product text not null,
  monthly_premium numeric(14,2) not null default 0 check (monthly_premium >= 0),
  purpose text,
  review_date date,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists insurance_policies_user_idx on public.insurance_policies(user_id, created_at desc);

create table if not exists public.insurance_claim_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid references public.insurance_policies(id) on delete set null,
  case_type text not null,
  occurred_on date,
  amount numeric(14,2) check (amount is null or amount >= 0),
  situation_summary text,
  status text not null default 'preparing' check (status in ('preparing','submitted_external','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists insurance_claim_cases_user_idx on public.insurance_claim_cases(user_id, created_at desc);

-- AI conversation persistence is API-managed. Ordinary chat may remain ephemeral.
-- A conversation is persisted when the user explicitly chooses a flow that requires storage,
-- such as sharing a transcript with a human advisor.
create table if not exists public.insurance_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  summary text,
  status text not null default 'active' check (status in ('active','closed','deleted')),
  model_provider text,
  model_name text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists insurance_ai_conversations_user_idx on public.insurance_ai_conversations(user_id, updated_at desc);

create table if not exists public.insurance_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.insurance_ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  safety_class text,
  created_at timestamptz not null default now()
);
create index if not exists insurance_ai_messages_conversation_idx on public.insurance_ai_messages(conversation_id, created_at);

-- Consent records are immutable evidence. Revocation is performed by the audited Insurance API.
create table if not exists public.insurance_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null,
  policy_version text not null,
  granted boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists insurance_consents_user_idx on public.insurance_consents(user_id, created_at desc);

-- Contact details are encrypted by the Insurance API before insert.
-- Clients cannot INSERT/UPDATE this table directly, preventing bypass of encryption,
-- consent evidence, status controls, and audit logging.
create table if not exists public.insurance_consultation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.insurance_ai_conversations(id) on delete set null,
  consent_id uuid references public.insurance_consents(id) on delete set null,
  contact_name text not null,
  contact_ciphertext text not null,
  contact_hint text,
  preferred_time text,
  ai_summary text not null,
  share_transcript boolean not null default true,
  status text not null default 'new' check (status in ('new','working','contacted','closed')),
  assigned_staff_id uuid references public.insurance_staff(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists insurance_consultation_status_idx on public.insurance_consultation_requests(status, created_at desc);
create index if not exists insurance_consultation_user_idx on public.insurance_consultation_requests(user_id, created_at desc);

create table if not exists public.insurance_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  consultation_id uuid references public.insurance_consultation_requests(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists insurance_audit_created_idx on public.insurance_audit_events(created_at desc);

create or replace function public.is_insurance_staff(required_roles text[] default array['admin','advisor','auditor']::text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.insurance_staff s
    where s.user_id = auth.uid() and s.active = true and s.role = any(required_roles)
  );
$$;
revoke all on function public.is_insurance_staff(text[]) from public;
grant execute on function public.is_insurance_staff(text[]) to authenticated;

alter table public.insurance_staff enable row level security;
alter table public.insurance_profiles enable row level security;
alter table public.insurance_policies enable row level security;
alter table public.insurance_claim_cases enable row level security;
alter table public.insurance_ai_conversations enable row level security;
alter table public.insurance_ai_messages enable row level security;
alter table public.insurance_consents enable row level security;
alter table public.insurance_consultation_requests enable row level security;
alter table public.insurance_audit_events enable row level security;

-- User-owned ordinary profile/policy/claim data.
create policy insurance_profile_owner_select on public.insurance_profiles for select to authenticated using (user_id = auth.uid());
create policy insurance_profile_owner_insert on public.insurance_profiles for insert to authenticated with check (user_id = auth.uid());
create policy insurance_profile_owner_update on public.insurance_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy insurance_policy_owner_select on public.insurance_policies for select to authenticated using (user_id = auth.uid());
create policy insurance_policy_owner_insert on public.insurance_policies for insert to authenticated with check (user_id = auth.uid());
create policy insurance_policy_owner_update on public.insurance_policies for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy insurance_policy_owner_delete on public.insurance_policies for delete to authenticated using (user_id = auth.uid());

create policy insurance_claim_owner_select on public.insurance_claim_cases for select to authenticated using (user_id = auth.uid());
create policy insurance_claim_owner_insert on public.insurance_claim_cases for insert to authenticated with check (user_id = auth.uid());
create policy insurance_claim_owner_update on public.insurance_claim_cases for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy insurance_claim_owner_delete on public.insurance_claim_cases for delete to authenticated using (user_id = auth.uid());

-- Stored AI transcript is readable by its owner. Staff can read a transcript only when it is
-- tied to an explicit human-handoff request whose share_transcript flag remains true.
-- Writes are service-role/API only.
create policy insurance_conversation_owner_select on public.insurance_ai_conversations for select to authenticated using (user_id = auth.uid());

create policy insurance_message_shared_select on public.insurance_ai_messages for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.insurance_consultation_requests r
    where r.conversation_id = insurance_ai_messages.conversation_id
      and r.share_transcript = true
      and public.is_insurance_staff(array['admin','advisor','auditor'])
  )
);

-- Consent evidence is readable by its owner but is created/revoked through the audited API.
create policy insurance_consent_owner_select on public.insurance_consents for select to authenticated using (user_id = auth.uid());

-- Consultation rows are readable by the requesting user and authorized Insurance staff.
-- INSERT and UPDATE are deliberately service-role/API only to enforce encryption, consent,
-- status rules and audit logging. Staff must use the admin API rather than direct table writes.
create policy insurance_consult_select on public.insurance_consultation_requests for select to authenticated using (
  user_id = auth.uid() or public.is_insurance_staff(array['admin','advisor','auditor'])
);

create policy insurance_staff_self_select on public.insurance_staff for select to authenticated using (
  user_id = auth.uid() or public.is_insurance_staff(array['admin'])
);
create policy insurance_audit_admin_select on public.insurance_audit_events for select to authenticated using (
  public.is_insurance_staff(array['admin','auditor'])
);

-- Intentionally absent:
-- * staff SELECT policy on insurance_policies / insurance_claim_cases
-- * authenticated INSERT/UPDATE policies on consultation requests, consents, AI conversations/messages
-- * authenticated INSERT policy on audit events
-- Human handoff exposes only the consultation request and, when explicitly shared, that transcript.
