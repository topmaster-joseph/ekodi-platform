# EKODI Integration Core

## Purpose

EKODI Integration Core is the EKODI-owned compatibility boundary for independently implemented services. It does **not** force vendors to adopt EKODI's internal framework, database, programming language, or AI workflow.

The governing rule is:

> Internal implementation is free. The EKODI contact boundary is standardized, EKODI-owned, and machine-verified before integration.

## Surfaces

- `dev.ekodi.kr` — external **EKODI Developer Center**. Publishes safe integration profiles and, after authentication, developer conformance tools.
- `admin.ekodi.kr/dev` — internal **EKODI Developer & Integration Admin**. Owns profile lifecycle, developer/company/project access, test policy, exception review, staging approval, production approval, and audit history.
- `EKODI Integration Core` — private shared core service. It has no public product domain of its own.
- `api.ekodi.kr/integration/*` — optional machine-to-machine gateway when production integrations require it. This is not required for the first scaffold.

The two web surfaces are projections of one core, not two independent systems.

## Ownership boundary

### EKODI Core remains canonical for

- user identity
- workspace identity
- tenant identity
- membership
- role and permission

An external service may store mappings or caches, but those copies cannot become a competing source of truth.

### Marketing AI may own

- marketing-specific profile extensions
- diagnosis results
- plans and campaigns
- generated content
- approval workflow state
- export/publish state
- performance metrics
- next-action recommendations

## Marketing AI Profile v1

The first profile is `marketing-ai@1.0.0`. A vendor service exposes:

`GET /.well-known/ekodi-integration.json`

Example:

```json
{
  "schema_version": "1",
  "service_id": "vendor-marketing-ai",
  "profile": "marketing-ai",
  "profile_version": "1.0.0",
  "capabilities": ["diagnosis", "planner", "content_generation", "approval", "export", "performance"],
  "identity_context": ["workspace_id", "user_id", "tenant_id", "service_id"],
  "endpoints": { "health": "/health" }
}
```

This manifest describes only the EKODI contact boundary. It does not disclose or prescribe vendor internals.

## Conformance v1

The initial automated runner verifies:

1. target URL security
2. manifest reachability without redirect
3. manifest required fields
4. profile/version match
5. EKODI canonical identity context declaration
6. required Marketing AI capabilities
7. same-origin health endpoint reachability

Full transaction/behavior contract tests are a later profile revision. A service is not production-compatible merely because its UI works.

## Security baseline

- conformance execution is closed unless `EKODI_INTEGRATION_TEST_KEY` is configured and supplied
- targets must use HTTPS
- localhost/private-style names and raw IP literals are rejected
- URLs with embedded credentials are rejected
- redirects are rejected
- health endpoints must remain same-origin paths
- public profile reading does not grant integration or production access
- `admin.ekodi.kr/dev` must be integrated through the existing EKODI admin IAM/control plane, never exposed as a bypass route

## Rollout

### Phase 1 — scaffold

- private Integration Core Worker
- Developer Center projection
- machine-readable Marketing AI Profile v1
- protected contact-boundary conformance runner
- tests

### Phase 2 — admin projection

Attach `admin.ekodi.kr/dev` to the existing authenticated admin shell. Add profile/version management, project credentials, test history, exception review, and approval gates.

### Phase 3 — integration lifecycle

Add sandbox credentials, behavior-contract scenarios, staging approval, audit evidence, and optional `api.ekodi.kr/integration/*` gateway routes.

## Production rule

Passing developer-side tests is advisory. EKODI reruns the same owned contract tests in EKODI-controlled CI/staging and makes the final PASS/FAIL and promotion decision.
