# EKODI Points goal person-index release continuity — 2026-11-03

## Official lineage
Source worker PR #7959, functional source 9cccd5be930fdbe2a19df1453a4fcc8741610cef.
First-party EKODI Orchestrator recovery PR #7960, branch ai/chatgpt/orch_recovery_9cccd5be930fdbe2a19df1453a4fcc87.
This owner-connected documentation-only update requests authentic latest-head GitHub Actions checks on that already-issued release branch. No release receipt, CI pass, authority or approval is fabricated.

## Scope and evidence
Add a single canonical Person-leading non-unique index on the private EKODI recognition goals table, to resolve the Supabase DEVELOPMENT advisor `unindexed_foreign_keys` INFO finding. Keep existing grants, private RLS, authenticated self-Person RPCs, site rules, points ledger and all financial policies unchanged.
Source CI and Supabase Local CI passed, including isolated SQL smoke verifying presence of the index. Independently verified index creation inside a development BEGIN/ROLLBACK transaction and confirmed its absence after rollback. No production data were touched.

## Release gates
Orchestrator must synchronize current main, require authentic latest-head CI, preserve exact source ancestry and receipt, then guarded merge/deploy. Do not merge worker PR directly or enable production points.
After guarded source promotion, development migration may be applied and the Supabase performance advisor rechecked. Production lacks points migrations and production points-api and remains POINTS_ENABLED=false; production schema rollout requires separate authorized controlled release, security review and live verification.
The synthetic browser E2E also requires owner-authorized CF_ACCESS_STAGING_CLIENT_ID and CF_ACCESS_STAGING_CLIENT_SECRET secrets for Cloudflare Access; never bypass that gate.
