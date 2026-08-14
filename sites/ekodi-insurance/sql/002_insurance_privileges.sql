-- Explicit privileges for EKODI Insurance.
-- RLS is the row boundary; table grants are the operation boundary.

revoke all on table
  public.insurance_staff,
  public.insurance_profiles,
  public.insurance_policies,
  public.insurance_claim_cases,
  public.insurance_ai_conversations,
  public.insurance_ai_messages,
  public.insurance_consents,
  public.insurance_consultation_requests,
  public.insurance_audit_events
from anon, authenticated;

grant usage on schema public to authenticated;

-- Ordinary user-owned records may be managed directly under RLS.
grant select, insert, update on public.insurance_profiles to authenticated;
grant select, insert, update, delete on public.insurance_policies to authenticated;
grant select, insert, update, delete on public.insurance_claim_cases to authenticated;

-- Sensitive/operational records are read-only to authenticated clients.
-- Creation, revocation, status changes, contact encryption and audit writes
-- are performed only by the Insurance API service role.
grant select on public.insurance_ai_conversations to authenticated;
grant select on public.insurance_ai_messages to authenticated;
grant select on public.insurance_consents to authenticated;
grant select on public.insurance_consultation_requests to authenticated;
grant select on public.insurance_staff to authenticated;
grant select on public.insurance_audit_events to authenticated;

revoke all on function public.is_insurance_staff(text[]) from anon;
grant execute on function public.is_insurance_staff(text[]) to authenticated;
