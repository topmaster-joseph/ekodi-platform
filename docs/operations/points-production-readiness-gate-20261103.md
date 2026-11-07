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

## 2026-11-08 — ledger immutability and replay gate

Read-only catalogue inspection independently confirmed on the *development* database that the `public.ekodi_point_ledger` table contains both `ekodi_points_ledger_append_only` (BEFORE UPDATE/DELETE row trigger wired to `ekodi_points_private.reject_ledger_mutation()`, enabled for origin/always) and a unique constraint on `(site_id,user_id,event_key)`. The production database has **neither**, because its points tables are not installed, and remains OFF.

The readiness preflight now checks both independently from PostgreSQL `pg_trigger`/`pg_constraint`; a missing, disabled or wrong-function append-only trigger or missing replay-uniqueness key returns `points_contract_incomplete`, even if all 20 migrations were previously recorded and RLS remained enabled. The query uses `EXISTS` and `to_regclass` so that missing production tables fail closed without running unsafe DDL or selecting member data. Regression tests explicitly reject both states. This evidence is limited to schema/trigger metadata; it is **not** a substitute for isolated transaction-rollback behavior tests, backup restore proof, financial policy, member E2E, owner authorization or live rewards activation.

## 2026-11-08 — development browser Access least-privilege correction

The existing developer-only synthetic browser verification used an overly broad temporary Cloudflare Access policy, `any_valid_service_token`, when static `CF_ACCESS_STAGING_CLIENT_ID` and `CF_ACCESS_STAGING_CLIENT_SECRET` were supplied. This could authorize unrelated valid tokens on the selected development Access application. The verifier source now requires an independent, owner-protected `CF_ACCESS_STAGING_SERVICE_TOKEN_ID` for an exact `service_token.token_id` policy. If that protected ID is absent, the workflow uses the already-supported new **run-scoped ephemeral** service token path, rather than opening a broad wildcard token policy.

The cleanup routine now only removes the policies/service token whose name matches its **exact run**, leaving other concurrently provisioned or unrelated E2E tokens untouched. The developer browser workflow also refuses an unknown/unprotected staging Access application instead of reporting an unverified test as safely reachable. Regression tests use synthetic Cloudflare API responses and never mutate a real Access application.

**Operations requirement:** Store the static token's exact ID (not the client secret) as `CF_ACCESS_STAGING_SERVICE_TOKEN_ID` inside the existing protected `development` GitHub environment if reusing a static token. Alternatively ensure the development automation token may create/revoke a short-lived token and its exact Access policies. This patch neither grants an Access permission nor authorizes production schema promotion or points activation. Running the real signed-in development browser E2E, collecting its results and cleaning up all synthetic data remain independent outstanding gates.
