# EKODI 4-Layer Deployment Continuity

Policy: `EKODI-DEPLOYMENT-FOUR-LAYER-001`

The deployment continuity order is:

1. **Runtime** — avoid a code deployment when the existing canonical runtime/data/config path can safely make the change.
2. **Deploy** — normal code releases use service-specific GitHub Actions + Wrangler guarded release.
3. **Cloud Control** — break-glass infrastructure repair only; it is not a second routine deployment lane.
4. **Owner** — account, billing, provider plan/limit, identity ownership and root-security decisions.

## Why this order

Cloudflare Workers Builds and Cloudflare Workers runtime are different limits. Normal EKODI service releases are external CI/CD through GitHub Actions + Wrangler, so exhausting Cloudflare Workers Builds capacity must not automatically stop a valid guarded release. Conversely, exhausting Workers runtime request capacity is a traffic/runtime problem; redeploying does not create more runtime quota.

Therefore EKODI chooses the lowest-authority, lowest-cost valid layer rather than retrying the same provider action.

## Layer 1 — Runtime

Use only when the change is already supported without a source-code release: data-driven content, existing feature flags, existing runtime config, cache/static paths, read-only health/diagnostics.

A runtime path must never impersonate a source-code change, widen authority, mutate credentials or create infrastructure.

## Layer 2 — Guarded Deploy

This remains the default code-release path.

`source -> CI -> staging -> 0% candidate -> production smoke -> promotion -> post-deploy verification`

The transport is GitHub Actions + Wrangler direct deployment. Cloudflare Workers Builds is not a required dependency of this path.

## Layer 3 — Cloud Control

Cloud Control repairs infrastructure state only through an allowlisted operation, temporary scoped credential, explicit audit and post-condition.

After repair, the service release returns to Layer 2. Cloud Control may not become a parallel Worker-version deployment path.

## Layer 4 — Owner

Only the owner may approve provider plan changes, paid commitments, limit-increase requests, account/billing ownership, identity ownership or root-security changes.

EKODI never automatically upgrades a paid plan.

## Quota behavior

- Unknown telemetry stays unknown; EKODI does not claim quota exhaustion without evidence.
- Workers Builds pressure may bypass the Builds product by retaining GitHub Actions + Wrangler when that path is healthy.
- Workers runtime quota exhaustion may use an already registered static/cache degraded path only for non-security-critical traffic.
- Security-critical auth/admin routes fail closed rather than bypassing a Worker security boundary.


## Executable runtime decision

The policy is not declaration-only. `scripts/resolve-deployment-four-layer.mjs` consumes the measured Production Cloudflare quota report and records the selected layer/action in GitHub Actions.

For a normal code release:
- `normal` / `warning`: Layer 2 Guarded Deploy proceeds with full verification.
- `protect`: Layer 2 proceeds, but nonessential verification is reduced; essential security/admin verification remains.
- `exhausted`: Layer 2 completes CI, staging and immutable release-artifact continuity, then enters `prepare-and-hold` before any production mutation or live Worker probe. The same verified source/artifact must be used when the measured quota resets.
- Cloud Control is never used to bypass runtime quota or as a second Worker deployment lane.
- Paid plan/limit changes remain Layer 4 Owner decisions only.

This distinction matters because Workers Free runtime requests reset daily, while Workers Builds has a separate monthly build-minute/concurrency model. GitHub Actions + Wrangler remains the canonical release transport; it does not turn Cloudflare Workers Builds into a required dependency.


## Automatic daily reset recovery

The canonical Shared Site release workflow performs one scheduled recovery check at **00:07 UTC**, after the Workers Free daily request reset boundary.

The schedule is not a second deployment lane. It proceeds only when the latest completed canonical Shared Site release failed specifically at the quota-aware `prepare-and-hold` boundary.

- If the held release SHA is still current main, the same source is revalidated from staging through immutable artifact continuity before production mutation.
- If main has advanced, the old held artifact is never promoted. The scheduled run treats current main as a fresh Guarded Deploy and repeats the full staging/artifact continuity path.
- Any non-quota failure remains stopped for review.
- Cloud Control, paid upgrade and Owner authority are never used as automatic quota bypasses.
