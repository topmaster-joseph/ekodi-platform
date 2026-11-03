# EKODI Points release readiness — official recovery continuity
Date: 2026-11-03 (Asia/Seoul).

## Release lineage
- Issue #7778. Source worker PR #7969, functional SHA dc465bf8892ec83cb6df8afd0916657c392c1de9.
- First-party EKODI Orchestrator recovery PR #7970, branch ai/chatgpt/orch_recovery_dc465bf8892ec83cb6df8afd0916657c.
- Source PR checks passed authentic CI, Supabase Local CI, Orchestrator Gate. The worker PR was closed unmerged; no direct main merge or deployment performed.
- This documentation-only update requests authentic latest-head required checks on the already-issued official recovery branch. No check bypass, release receipt fabrication, production deployment, or points-policy activation is authorized here.

## Checked safeguards
- New scripts/verify-points-release-readiness.mjs performs only read-only Management API queries for fixed development and production project refs, and derives 20 ordered migrations directly from current source.
- It differentiates missing base identity, absent points schema, partial install, broken RLS/permission/API contract, and technical readiness, while always leaving points_activation_authorized=false.
- Tests reject anonymous-goal access, missing JWT verification and malformed API responses; default CLI is fail-closed.
- Production independently inspected: canonical people/login/tenants/Auth dependencies present; ALL point-specific tables/RPC/function and migration history absent; production feature flag remains false.
- Development dev points-api v6 JWT-verified ACTIVE, point goal migrations/Person index installed, shared-email duplicate referral guard applied; rollback proof REFERRAL_SHARED_EMAIL_SMOKE_PASS. No production SQL changed.

## Separate operational gates
- Production schema installation requires a distinct protected production-migration lane, a source-controlled release receipt, explicit approved backup/PITR and owner/security authorization. The new readiness script does NOT install schemas.
- JWT-verified production points-api deployment must follow schema preflight, with anonymous request rejection, canary and rollback checks.
- Development synthetic browser E2E remains blocked by missing Cloudflare Access staging service-token GitHub secrets; never bypass Cloudflare Access or invent credentials.
- Even technical readiness must NOT activate financial awards, site policies, transfers or donations without audited budget, second approver, site opt-in, fraud and legal controls.

## Authenticated latest-main check renewal
The initial owner-connected continuity HEAD 279d76361bb6eedc9e9ddfe33159c38ecf6404ca passed real CI, Supabase Local CI and orchestration checks. Concurrent EKODI changes then caused the official recovery branch to synchronize current main and advance to bot HEAD 478f53f3e7d75848048047fb2aab0028e46f6b08, whose PR event checks are action_required.
This owner-connected update requests authentic GitHub checks on that latest synchronized official branch. It does not change executable source or authorize production database writes, schema promotion, feature activation, financial policy or credential issuance.
