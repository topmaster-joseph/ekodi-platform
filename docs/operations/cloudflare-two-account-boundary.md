# EKODI Cloudflare Two-Account Boundary

## Decision
EKODI keeps two core Cloudflare accounts until a real legal, ownership, compliance, or enterprise-isolation requirement appears.

- **EKODI Development**: development, pull-request staging, smoke tests, experiments, test-only data and non-production Workers.
- **EKODI Production**: real `*.ekodi.kr` traffic, production Workers, production data, production routes and customer-facing services.
- Future isolated customer accounts follow a **2 + N** model and are exceptions, not the default.

## Fixed Development boundary

Development Cloudflare account ID:

```text
46aad4738793fbaca88574832a2ccc0f
```

GitHub Actions development secret name:

```text
CLOUDFLARE_DEVELOPMENT_API_TOKEN
```

Never store the token value in the repository.

## Deployment rules

1. Any Worker whose name ends in `-staging`, or any PR-only staging Worker, deploys only to EKODI Development.
2. Worker staging workflows use `environment: development`, the fixed Development account ID and `CLOUDFLARE_DEVELOPMENT_API_TOKEN`.
3. Staging verification URLs use the Development `workers.dev` namespace, `*.ekodi-development.workers.dev`.
4. Production secrets must not appear in Worker staging workflows.
5. Production routes and production data bindings must never be attached to staging Workers.
6. Production deploys remain service-specific and guarded. Full-ecosystem verification stays read-only.

## Development Access protection

The EKODI Development account protects its `workers.dev` staging surface with Cloudflare Access. An unauthenticated probe can therefore return `302` with a `Www-Authenticate: Cloudflare-Access` challenge instead of exposing application content.

This is a security boundary, not a staging failure. CI first proves that the Worker was successfully deployed to the fixed Development account. It then accepts a Cloudflare Access challenge as proof that the staging endpoint is present and protected. If Access is not in front of a staging endpoint, the workflow falls back to the service-specific health and isolation checks.

Do not disable Access merely to make unauthenticated smoke tests pass. If deeper automated application checks are required later, use a narrowly scoped Cloudflare Access service token rather than making Development public.

## Marketing preview boundary

Marketing UI previews are non-production workloads and therefore run only in **EKODI Development**.

- `stage-marketing-pages-shell.yml` uses `environment: development`, the fixed Development account ID and `CLOUDFLARE_DEVELOPMENT_API_TOKEN`.
- The built Marketing UI tree is served by a Development-only Worker Static Assets deployment, so no additional Cloudflare Pages permission is required.
- Preview deployment never uses Production Cloudflare credentials, routes, custom domains or data bindings.
- An unauthenticated probe may be accepted as healthy when Cloudflare Access returns the expected protected challenge.
- A dedicated CI boundary contract prevents this preview from reverting to Production credentials or `wrangler pages deploy`.

## Production staging residue cleanup

Old `*-staging` scripts can remain in Production after the deployment boundary is corrected. Do not bulk-delete them.

Delete a Production staging script only after all of the following are true:

1. The same staging service has been deployed successfully to EKODI Development.
2. Its Development health/smoke checks pass or the staging endpoint is confirmed behind the expected Cloudflare Access boundary.
3. The Production copy has no production Worker route or custom-domain dependency.
4. No KV, D1, R2, Durable Object, Queue or secret binding is uniquely depended on by production.
5. A rollback path is known.

This makes cleanup a migration, not a gamble.

## Usage balance

The accounts are not expected to have equal request counts.

- Real user requests should overwhelmingly land in Production.
- Build, deploy, smoke-test and experimental activity should disproportionately land in Development.
- A healthy split is measured by **boundary correctness**, not 50:50 traffic.

## Expansion rule

Create another Cloudflare account only when a tenant or business unit requires independent ownership, billing, compliance, administrative control, or a materially different blast radius. Otherwise keep isolation inside the two core accounts with separate Workers, bindings, namespaces, access policies and data stores.

## Guardrails

`.github/workflows/cloudflare-boundary-audit.yml` fails changes that reintroduce Production credentials or the Production `workers.dev` namespace into Worker staging workflows. Production load tests remain manual and bounded.

`.github/workflows/cloudflare-account-hygiene.yml` inventories both accounts after this boundary lands on `main` and then weekly. It is read-only and reports Production staging residue for route/binding review before any deletion.
