# EKODI Trust Layer

Status: foundation implementation, shadow-only

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

## Versioned contracts

Initial versions:

- Policy: `trust_policy_v1`
- Capability schema: `capability_schema_v1`
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
- default-deny policy evaluation
- compatibility adapter for the current authorization source
- shadow comparison
- capability derivation
- recursive restricted-field removal
- safe audit summaries

### `supabase/functions/trust-api/index.ts`

Authenticated shadow evaluator:

- resolves the authenticated Supabase user server-side
- reuses `current_site_access` and `current_site_workspaces`
- rejects a workspace that is not present in the caller's resolved workspace set
- refuses `enforce` mode
- loads versioned shadow policy server-side
- writes minimum-data comparison audit rows
- returns `cache-control: no-store`

Client-supplied roles or authorization decisions are not trusted.

### `20260903010000_trust_layer_foundation.sql`

Internal state:

- `trust_policy_versions`
- `trust_projection_profiles`
- `trust_shadow_decisions`

RLS is enabled and direct `anon` / `authenticated` table privileges are revoked intentionally. These are server-side Trust state tables, not browser data sources.

## Non-negotiable invariants

1. Shadow mode must never alter the current live decision.
2. No policy has an implicit allow. No match means deny.
3. Browser hiding is never treated as security.
4. Secrets, reusable credentials, private keys and internal topology are removed before serialization.
5. A Trust projection cannot widen a denied authorization decision.
6. Workspace selection must be resolved against server-side membership data.
7. Audit rows do not store request bodies, bearer tokens, secrets or reusable credentials.
8. RLS remains active after Trust Layer authority cutover.
9. External AI receives a purpose-bound projection, not canonical platform internals.
10. Production authority cutover requires explicit gated deployment and rollback readiness.

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

The current foundation intentionally leaves `authoritative_source=legacy` and `cutover_allowed=false`.
