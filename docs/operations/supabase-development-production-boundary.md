# EKODI Supabase Development / Production Boundary

## Decision

EKODI uses the existing two Supabase projects as environment boundaries, not as traffic-sharding peers.

- **Production data plane**: project ref `renzehysxirjilvdxacv` (currently named `ekodi-platform`), logical role `ekodi-prod`.
- **Development data plane**: project ref `lxcxwbdwwojjkgybbqii` (currently named `ekodi-church`), logical role `ekodi-dev`.

The logical role is authoritative even if the provider-side display name has not yet been renamed.

## Environment contract

### Production

Production stores real member, organization, mission, trade, commerce, audit and other live platform state.

Rules:

1. No experimental SQL or ad-hoc schema mutation.
2. No debug/probe-only functions unless they are explicitly required for operations.
3. Schema changes arrive only as versioned migrations that were verified in development.
4. Production credentials are available only to guarded release controllers.
5. Production completion means live verification succeeded; merge or deploy alone is not completion.

### Development

Development is for migrations, Edge Functions, integration tests, synthetic fixtures, staging and destructive test cases.

Rules:

1. Never copy real production user/member/contact/payment/church-private data into development.
2. Use synthetic fixtures or anonymized, non-reversible test data only.
3. Development credentials cannot mutate production.
4. Development may contain probes and diagnostics that are forbidden in production.
5. Promotion always moves code/schema forward; production data never syncs backward.

## GitHub mapping

```text
feature/* or ai/*
        |
        v
Pull Request
        |
        v
CI + Supabase boundary validation
        |
        v
development branch
        |
        +--> Cloudflare Development
        +--> Supabase development project
        |
        v
guarded promotion
        |
        v
main
        |
        +--> Cloudflare Production
        +--> Supabase production project
        |
        v
live production verification
```

GitHub remains the source of truth for migrations and deployable source. Supabase Studio is not the source of truth for production schema changes.

## Traffic and scaling

DEV/PROD separation is for blast-radius and data-safety isolation. It is **not** used to split production traffic.

Production traffic scales through:

- Cloudflare WAF, cache and rate limiting.
- Stateless EKODI Gateway / Workers.
- Queue-based write pressure relief.
- Supabase connection pooling and bounded queries.
- Selective Realtime, not one WebSocket per page/view.
- Read replicas or larger compute only when measured load requires them.

The architecture must remain viable from 100 concurrent users through 100,000 by keeping most public reads at the edge and preventing user concurrency from becoming equal to database concurrency.

## Security gates

Before production promotion:

- RLS posture is checked.
- exposed SECURITY DEFINER functions are reviewed.
- service-role keys never appear in browser code.
- production and development secrets remain isolated.
- migration is additive/reversible where practical, otherwise requires explicit guarded release handling.
- Security Advisor and Performance Advisor findings are reviewed for regressions.

## Current migration note

The development project currently contains church and Cloudflare/OAuth probe residue. Do not delete or repurpose data blindly. Clean it incrementally after each dependency is proven absent or migrated. The production project already contains the canonical church schemas, so future church production state remains in production under schema/API/RLS boundaries unless a separate legal/compliance isolation requirement appears.
