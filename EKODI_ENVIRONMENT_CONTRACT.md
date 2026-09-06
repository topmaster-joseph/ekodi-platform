# EKODI Environment Contract

Status: adopted architecture contract, with Supabase names in transition until the existing church data is safely consolidated.

## 1. Canonical source and promotion path

`topmaster-joseph/ekodi-platform` is the canonical platform repository.

- `main` is the production source.
- `development` is the persistent development source already used by the Cloudflare development deployment.
- Short-lived AI/feature branches merge through pull requests.
- Pull-request staging uses the existing GitHub `development` environment and isolated Cloudflare staging resources.
- Production changes are promoted only after CI, migration, staging, and smoke checks pass.

The intended end-to-end mapping is:

| Layer | Production | Development / Staging |
| --- | --- | --- |
| GitHub | `main` + `production` environment | `development` + `development` environment; PR staging uses the same non-production boundary |
| Cloudflare | production account/resources | development/staging account/resources |
| Supabase | logical `ekodi-platform` | logical `ekodi-platform-dev` |

## 2. Supabase transition mapping

The two existing free Supabase projects are retained while data is reorganized without destructive cutover.

- Production logical target `ekodi-platform` currently maps to project ref `renzehysxirjilvdxacv`, whose current display name is `cheonggye-market`.
- Development logical target `ekodi-platform-dev` currently maps to project ref `lxcxwbdwwojjkgybbqii`, whose current display name is `ekodi-church`.
- The second project must not be treated as disposable development data until church production data and dependencies have been safely migrated and verified.

Display-name changes and service-data consolidation are separate operations. A rename must never be treated as a data migration.

## 3. PostgreSQL isolation policy

EKODI uses one shared production PostgreSQL platform by default. A new tenant or ordinary service does not receive a new Supabase project merely because it is a new service.

Isolation is layered:

1. PostgreSQL schema boundary by domain.
2. `tenant_id` / organization ownership for shared service data.
3. Row Level Security for user and tenant access.
4. Cloudflare Worker / API capability checks before sensitive server-side operations.

Target domain schemas are `core`, `identity`, `tenancy`, `shared`, `church`, `church_private`, `market`, `commerce`, `community`, `work`, `content`, `ai`, `audit`, `private`, and `api`.

Sensitive church pastoral data belongs in a stricter private boundary. Raw production personal data must not be copied into non-production. Development uses synthetic or explicitly anonymized data.

A dedicated database is an exception justified by material scale, legal/contractual isolation, unusually sensitive data, operational blast-radius requirements, or a clear independent lifecycle.

## 4. Free-plan liveness policy

A provider-specific keepalive is allowed only when the provider can suspend an otherwise healthy free resource because of inactivity.

For Supabase Free projects, EKODI uses `public.ekodi_keepalive()` as a minimal read-only liveness RPC. The function returns a constant and does not read or write business, tenant, personal, church, or market data. The scheduled probe runs three times per day for each active free project.

Artificial writes, fake users, dummy transactions, or touching business tables solely to create activity are prohibited.

Cloudflare resources do not receive synthetic database traffic merely for appearance of activity. Normal health checks may still run for availability monitoring.

## 5. Credential policy

Only Supabase publishable keys may be used by the read-only liveness probe. Service-role, secret, database password, OAuth secret, and Cloudflare privileged tokens must never be committed to the repository or exposed to browser code.

The liveness RPC must remain data-independent. If it is ever changed to read tenant or business data, the public/publishable invocation grant must be removed and the design reviewed again.

## 6. Production safety gates

The target release flow is:

`short-lived branch -> PR -> local/CI database migration checks -> development or PR staging -> smoke/E2E -> main -> production migration/deploy -> production smoke check`

The repository should enforce `main` through branch protection/rulesets requiring pull requests and the relevant CI checks. This contract is additive and does not itself authorize destructive consolidation of the current `ekodi-church` project.
