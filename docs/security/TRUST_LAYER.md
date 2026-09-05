# EKODI Trust Layer

Status: foundation implementation, shadow-only; first action-level migration slice in progress

## Purpose

EKODI Trust Layer gives every protected EKODI surface one security language while preserving the existing Identity, Access, Workspace and RLS defenses.

Canonical chain:

`Identity -> Security Context -> Policy Decision -> Capability -> Secure Projection -> Distributed Enforcement -> RLS -> Audit`

The Trust Layer is not a replacement for RLS and is not a single mandatory network hop. Policy semantics are centralized; enforcement remains close to each API, RPC, storage boundary and AI gateway.

## Transition model

EKODI uses **complete parallel build + shadow verification + atomic authority cutover**.

1. Build the complete Trust foundation beside the current production path.
2. Adapt current authorization into the Trust context without changing live decisions.
3. Run candidate policy decisions in shadow mode.
4. Compare legacy and Trust decisions and audit only minimum safe context.
5. Treat `legacy=DENY / trust=ALLOW` as a critical widening defect.
6. Cut over the authority point only after parity, boundary, rollback and Super Administrator gates pass.
7. Keep RLS and service-local enforcement as independent final defenses after cutover.

There is no long-lived per-service opt-out. After final cutover, every protected EKODI request must participate in the common Trust contract even though the enforcement implementation remains distributed.

## Canonical capability language

Admin OS already uses the canonical `namespace:resource.action` capability grammar, for example:

- `workspace:access.read`
- `workspace:access.review`
- `admin:accounts.write`

New Trust migrations must use this grammar explicitly. The older dotted `service.resource.action` values produced by `capabilitySet()` are retained only for compatibility-only Trust surfaces during migration and must not be extended as a second capability language.

Role names such as `tenant_admin` and `platform_admin` remain inputs that resolve to permissions; they are not the long-term permission vocabulary themselves.

## Explicit candidate-policy coverage

A shadow policy with independent rules must declare the exact request surface covered by those rules. Outside that `coverage`, Trust mirrors the current authorization result through the compatibility adapter.

This prevents a small candidate rule set from accidentally default-denying unrelated EKODI services and producing misleading shadow divergence noise. Inside explicit coverage, normal Trust default-deny behavior applies.

Some migrations require an endpoint-specific legacy predicate that the generic `trust-api` cannot reconstruct exactly. Those policies set `generic_evaluator_compatible=false`. The generic evaluator then stays in compatibility mode, while the protected endpoint itself performs the independent candidate comparison using its real legacy predicate.

## First migration slice: `access-api`

The first action-level migration covers only:

- `GET /pending` -> `workspace:access.read`
- `POST /review` -> `workspace:access.review`

The live authority remains the existing `platformAdmin()` / tenant membership reviewer logic. The endpoint computes that real legacy predicate first, then evaluates the same request against the candidate Trust policy and records `legacyAllowed`, `trustAllowed`, parity and severity.

The candidate Trust policy is `trust_policy_v2` with capability schema `capability_schema_v2`. It is limited to the `access-request` resource and the `pending.read` / `review` actions. A `legacy=DENY / trust=ALLOW` result remains `critical`.

Because the generic Trust API currently derives its legacy result from site-access state, `trust_policy_v2` is explicitly marked `generic_evaluator_compatible=false`. Only the `access-api` observer evaluates these two candidate rules against the real reviewer predicate.

Shadow observation is deliberately non-authoritative and failure-isolated. A Trust policy lookup, audit-salt or shadow-audit failure is logged but must never change the live legacy allow/deny result.

## Versioned contracts

Initial foundation versions:

- Policy: `trust_policy_v1`
- Capability schema: `capability_schema_v1`
- Projection: `projection_v1`

First candidate migration versions:

- Policy: `trust_policy_v2`
- Capability schema: `capability_schema_v2`
- Projection: `projection_v1`

Every Trust audit record carries these versions so a historical decision can be reconstructed without storing the raw request or secrets.

## Projection profiles

- `user-self`: minimum data required for the authenticated user's own surface.
- `workspace-member`: workspace-scoped minimum disclosure.
- `safe-admin`: administrative visibility without reusable credentials, private keys or raw infrastructure details.
- `experience`: safe/synthetic experience data only.
- `external-AI`: minimum purpose-bound, pseudonymized context for external AI providers.
- `agent-task`: task-scoped operational-agent context with expiration expected at the orchestration layer.

View, export, download, API access, AI sharing and raw diagnostics are separate capabilities. Projection can narrow, mask, redact, aggregate or synthesize data; it must never widen authorization.

## Foundation components

### `supabase/functions/_shared/trust.ts`

Pure Trust primitives:

- security-context normalization
- canonical capability construction for new migrations
- explicit candidate-policy coverage checks
- default-deny policy evaluation
- deny-before-allow precedence at equal policy priority
- compatibility adapter for the current authorization source
- shadow comparison
- explicit cutover gate for any future enforce mode
- legacy action-specific capability derivation for compatibility-only surfaces
- recursive restricted-field removal
- safe audit summaries

### `supabase/functions/trust-api/index.ts`

Authenticated shadow evaluator:

- resolves the authenticated Supabase user server-side
- reuses `current_site_access` and `current_site_workspaces`
- rejects a workspace that is not present in the caller's resolved workspace set
- refuses `enforce` mode
- loads versioned shadow policy server-side
- applies candidate rules only when the policy is generic-evaluator-compatible and the request is inside explicit coverage
- otherwise remains on the legacy compatibility adapter
- writes minimum-data comparison audit rows
- requires `TRUST_AUDIT_SALT` for pseudonymous subject hashes
- returns `cache-control: no-store`

Client-supplied roles or authorization decisions are not trusted.

### `supabase/functions/access-api/index.ts`

First migrated protected surface:

- retains the real legacy reviewer predicate as the live authority
- resolves reviewer roles server-side from `profiles.platform_admin` and active `tenant_members`
- evaluates `/pending` and `/review` in Trust shadow mode
- emits canonical `workspace:access.*` capabilities
- records the same minimum-data Trust comparison audit shape
- treats shadow observation failures as telemetry failures, never authorization failures

### Trust migrations

`20260903010000_trust_layer_foundation.sql` creates internal Trust state:

- `trust_policy_versions`
- `trust_projection_profiles`
- `trust_shadow_decisions`

`20260905020000_access_api_trust_shadow.sql` adds the first independently evaluated candidate policy slice while keeping `authoritative_source=legacy`, `cutover_allowed=false`, and `generic_evaluator_compatible=false`.

RLS is enabled and direct `anon` / `authenticated` table privileges are revoked intentionally. These are server-side Trust state tables, not browser data sources.

## Deployment prerequisite

For audit pseudonymization, Trust callers first use an environment-specific `TRUST_AUDIT_SALT` when configured. Otherwise they read `trust_audit_salt` from Supabase Vault through the service-role-only `trust_runtime_audit_salt()` RPC. The Vault secret is generated inside the database and its plaintext is never committed. If neither source is available, standalone `trust-api` fails closed; embedded shadow observers log the telemetry failure and preserve the legacy live decision. Never put the salt in source control, logs, browser configuration, or plain migration literals.

## Non-negotiable invariants

1. Shadow mode must never alter the current live decision.
2. No candidate policy has an implicit allow. No match inside explicit coverage means deny.
3. At equal priority, a matching deny rule wins over an allow rule.
4. Browser hiding is never treated as security.
5. Secrets, reusable credentials, private keys and internal topology are removed before serialization.
6. A Trust projection cannot widen a denied authorization decision.
7. Workspace selection must be resolved against server-side membership data.
8. Audit rows do not store request bodies, bearer tokens, secrets or reusable credentials.
9. RLS remains active after Trust Layer authority cutover.
10. External AI receives a purpose-bound projection, not canonical platform internals.
11. View permission does not imply export, download, API, AI-share or raw-diagnostic capability.
12. Production authority cutover requires both the code-level `cutoverAllowed` gate and the guarded deployment approval path.
13. New migrations must not create a second capability grammar.
14. Independent candidate rules must not apply outside explicit migration coverage.
15. Endpoint-specific legacy predicates must not be approximated by a generic evaluator during parity measurement.

## Shadow exit gates

Authority cutover remains disabled until all of the following are true:

- no unresolved critical `legacy=DENY / trust=ALLOW` comparisons
- expected restrictive differences are reviewed and approved
- tenant/workspace isolation tests pass
- protected APIs have enforcement adapters or equivalent Trust integration
- projection tests cover sensitive fields and export/API/raw-data capability separation
- authentication and authorization error rates remain within approved baselines
- rollback to the previous authority point is proven
- deployment is approved through the EKODI guarded release path

## Rollback triggers

After a future authority cutover, immediately roll back the authority point on confirmed tenant-boundary widening, unexpected authentication failure spikes, material 401/403 anomalies, projection leakage, policy-version resolution failure, or critical protected-API regression.

The current implementation intentionally leaves `authoritative_source=legacy` and `cutover_allowed=false`.