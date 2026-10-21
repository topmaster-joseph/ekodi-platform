# Operator Hub Implementation Plan

Implementation must preserve existing authorization and deployment guardrails while changing the product boundary of My EKODI.

## Required implementation

1. Treat `/my/` as an operator entry surface only.
2. Keep ordinary site-member flows site-local after authentication.
3. Build operator cards from existing authorized site/service access; do not create a parallel role source.
4. Route each card to that site's authoritative admin surface.
5. Preserve legacy host redirects and CORS only as compatibility boundaries.
6. Add regression checks preventing ordinary-user flows from being pointed to `/my/` by default.
