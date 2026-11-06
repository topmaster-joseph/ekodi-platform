# EKODI Activity Points — production readiness gate

**Status: production feature OFF; no production points schema or points-api.**
Date: 2026-11-03 (Asia/Seoul); issue #7778.

## Evidence-backed environment inventory

| Check | Development | Production |
| --- | --- | --- |
| Canonical Person, linked identities, tenants, Auth, activity context | Present | Present |
| Points foundation, rules, wallets and append-only ledger | Present | Absent |
| Member evidence claims and approved adapters | Present | Absent |
| Recognition goals private table/RPC | Present | Absent |
| JWT-verified points-api Edge Function | ACTIVE v6 | Absent |
| Supabase points migration history | 20 source migrations represented; managed application names may be prefixed | None |
| My EKODI points UI | Four tabs live, gated | Four tabs live, gated |
| Production activation | Not applicable | POINTS_ENABLED=false |

Inventory was obtained using read-only Supabase catalogue and migration queries, function listing, GitHub source and the canonical public points page. Source naming normalization strips historical timestamp prefixes in managed migration names but never substitutes a migration for an absent database object.

## Read-only release preflight

Run `SUPABASE_ACCESS_TOKEN=... node scripts/verify-points-release-readiness.mjs --production --report` only inside the approved credential-bearing environment (never paste a secret in chat, commit or logs). `--development` checks the other project. Without `--report`, any state short of `technically_ready_for_policy_review` returns a nonzero code. All calls are Management API GET or database `query/read-only`. The script cannot mutate either project, deploy a function, or enable activity rewards.

The script derives the ordered 20 EKODI points migrations from version-controlled `supabase/migrations/*_ekodi_(site_activity_points|points)_*.sql` and compares them with the managed schema-migrations ledger. It independently checks six pre-existing dependencies, point schema/RPC objects, authenticated-only goals access, and ACTIVE JWT-enabled `points-api`.

Possible states: `prerequisites_missing`, `points_not_installed`, `points_partially_installed`, `points_contract_incomplete`, or `technically_ready_for_policy_review`. **Even the final technical state never authorizes economic rewards or member activation.**

## Guarded future production sequence — do not skip

1. **Security review:** inspect each of the 20 forward-only migrations and dependencies against the live production schema; verify Supabase backup/PITR, maintenance policy, function grants/RLS, service-role isolation and the absence of unintended membership, donation or attendance rewards. Preserve canonical Person identity and single append-only ledger.
2. **Developer E2E:** with the authorized limited Cloudflare Access service token saved to GitHub `development` environment (`CF_ACCESS_STAGING_CLIENT_ID`, `CF_ACCESS_STAGING_CLIENT_SECRET`), run `verify-points-staging-browser.yml`. It creates a synthetic member, site and pending claim, checks desktop/mobile tabs, weekly goals, governance, refresh-after-claim and cleanup. Do not bypass Cloudflare Access or use real customer data.
3. **Orchestrator release authority:** a separate protected production-schema workflow is required with exact merged-main SHA, matching `ai/<agent>/orch_*` release receipt and GitHub `production` environment authorization. Apply migrations in source order, verify after each and preserve a recovery/rollback procedure; never run ad-hoc production SQL from an AI worker.
4. **Backend deployment:** after schema/RLS gates, deploy the JWT-verified `points-api` from the exact approved main source via the authorized production lane. Confirm it is ACTIVE, rejects anonymous requests with HTTP 401, exposes no mutation method, and can resolve only the signed-in canonical Person.
5. **Site-level canary and activation:** keep `POINTS_ENABLED=false` and site/rule/transfer/donation flags disabled until a distinct owner/finance/legal approval, budget caps, second-approver roles, fraud controls and synthetic live proof exist. Any canary must initially be non-economic and reversible.
6. **Operational acceptance:** validate 320/390/768/1440px views, site and account switch isolation, timezone boundary, idempotency, referral abuse, pending/approved/reversal ledger, audits and alerts, plus actual production URLs and a release receipt. Only then report the specifically observed completion scope.

## Development safeguards

The development goals migration and person-leading index are present and the isolated SQL contracts passed. A missing shared-email duplicate-referral denial migration was additionally applied in development and the `REFERRAL_SHARED_EMAIL_SMOKE_PASS` synthetic rollback test passed. Production remains unchanged. Supabase's intentional private-schema `rls_enabled_no_policy` information and authenticated SECURITY DEFINER RPC warning require continued source-verified least-privilege review, not bulk privilege grants.

Do not merge worker PRs directly, disable CI, create secret credentials as a workaround, or substitute a passing UI check for live account credit verification.

## 2026-11-07 live read-only security checkpoint

- Authenticated Supabase inventory: production has canonical people/tenant prerequisites but **no points sites, rules, ledger, evidence claims, private recognition goals, recognition RPCs or points-api**. Development has those objects and an ACTIVE, JWT-verified points-api.
- Development catalogue reports **17 points-owned tables** across `public.ekodi_point_*` and `ekodi_points_private`, all with RLS enabled; `anon` has no direct SELECT/INSERT/UPDATE/DELETE, and `authenticated` has no direct INSERT/UPDATE/DELETE.
- Read-only `points_tables_secure` preflight checks every matching table, requires at least one table, and fails if any table loses RLS, allows anonymous table access or allows direct authenticated writes. Missing production tables return false.
- This is a **security gate only**. It does not install schema, alter grants, activate earning, authorize redemption, or certify production. No member points are spendable based on this checkpoint.
