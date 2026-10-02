# EKODI Environment Contract

Status: enforced architecture contract.

EKODI uses one canonical GitHub repository and two Supabase projects as **environment boundaries**. They are not production traffic-sharding peers.

## 1. Canonical mapping

| Layer | Production | Development / Staging |
| --- | --- | --- |
| GitHub | `main` + `production` environment | `development` + `development` environment; short-lived `ai/*` branches through PR |
| Cloudflare | production resources | development/staging resources |
| Supabase | `renzehysxirjilvdxacv` / logical `ekodi-prod` | `lxcxwbdwwojjkgybbqii` / logical `ekodi-dev` |

Provider display names may lag the logical roles. The production project is named `ekodi-platform-prod`; the development project is named `ekodi-platform-dev`. Logical roles remain governed by repository policy and the immutable project refs.

## 2. Promotion path

`short-lived branch -> PR -> local/CI checks -> ekodi-dev -> development/staging smoke/E2E -> guarded main -> ekodi-prod -> production smoke -> live verification`

Rules:

- No AI, developer, workflow, or external provider may mutate production as a development shortcut.
- Production schema changes are versioned and must be exercised in development first.
- Production completion means the live service is verified, not merely merged or deployed.
- The `development` branch and GitHub `development` environment may access only development credentials.
- The `main` branch and GitHub `production` environment are the only repository path allowed to obtain production deployment credentials.

## 3. Data isolation

Production contains real member, organization, mission, trade, commerce, audit, church and other live state.

Development must use synthetic fixtures or explicitly anonymized non-reversible data. Raw production personal, contact, payment, pastoral or other sensitive records must never be copied into development.

Schema moves forward from development to production. Production data never synchronizes backward into development.

## 4. Existing development-project transition

Project `lxcxwbdwwojjkgybbqii` is now named `ekodi-platform-dev` with logical role `ekodi-dev`, but it still contains legacy church/Cloudflare probe functions from its former role.

This is a controlled drain, not a destructive rename:

1. No new production dependency may target this project.
2. Existing production dependencies must be migrated to `ekodi-prod` or retired.
3. Legacy tables/functions remain until dependency absence is proven.
4. Destructive cleanup is forbidden until that proof is recorded.
5. Church production state belongs to the production project under schema/API/RLS boundaries unless a later legal/compliance requirement justifies physical separation.

## 5. PostgreSQL isolation

Ordinary services do not receive separate Supabase projects. Isolation is layered by domain schema, tenant/organization ownership, RLS, and Cloudflare/API capability checks.

Target domain schemas include `core`, `identity`, `tenancy`, `shared`, `church`, `church_private`, `market`, `commerce`, `community`, `work`, `content`, `ai`, `audit`, `private`, and `api`.

## 6. Traffic and scale

DEV/PROD separation protects data and blast radius. Production scale is handled through Cloudflare WAF/cache/rate limiting, stateless Workers/Gateway, queue-based pressure relief, bounded Supabase queries/pooling, selective Realtime, and later compute/read scaling when measurements justify it.

The architecture target is 100 -> 1,000 -> 10,000 -> 100,000 concurrent users without making user concurrency equal database concurrency.

## 7. Credential and security policy

- Service-role/secret keys never appear in browser code or the repository.
- Development credentials cannot mutate production.
- Production credentials cannot be exposed to PR or development jobs.
- RLS is required for browser-exposed tables.
- SECURITY DEFINER RPCs require explicit review.
- Supabase Security/Performance Advisor regressions block promotion when material.
- Destructive database changes require explicit guarded handling.

## 8. Free-plan liveness

Supabase free-resource liveness may use only the minimal read-only `public.ekodi_keepalive()` RPC. Artificial writes, fake users, dummy transactions, or business-table touches for keepalive are forbidden.
