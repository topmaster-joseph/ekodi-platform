# Education direct-route and QR release — authentic exact-head checkpoint

Task: `edu-direct-links-qr-crawl-20261121`. Official Orchestrator PR #10026 (source #10025).

## Verified source change and tests
- Primary source HEAD `b4de5b0777bb0f6425244b4e0001b1e617531693` passed all authentic protected source checks, including CI run 44848228252, Education isolation workflow 44848228297, Constitution, security, Cloudflare boundary, provider guard, Supabase local, zero-subdomain and parallel-conflict checks.
- Original education navigation source and all six course catalog URLs were changed directly to `/edu/...` (NOT redirect aliases). Native screen QR producer uses public learner path only; instructor token/secret is not embedded.
- Public catalog resource allowlist was updated from service-root `/study/...` to direct `/edu/study/...` and `/edu/pizza-experience/...`, preserving teacher-only metadata exclusion.
- Unit tests cover 23 public Education HTML entry/subpages, QR code encode and destination for the real one-session 120m and two-session 240m FactChat courses, all six teacher feedback sessions, and consent-only screen-share QR structure.
- `scripts/verify-education-deep-links-native.mjs` is a read-only isolated production Chromium crawl. It MUST reject any 301/302/303/307/308 navigation, 404/5xx, duplicate /edu mount, unauthenticated management access, or noncanonical QR destination. The guard is part of the protected Education deployment workflow.
- No personal Opera browser tabs, actual QR room creation, student/teacher secrets, or privileged sessions used by these checks.

## Protected merge continuity

The orchestrator synchronized the recovery branch to new HEAD `72e5f97ed10171e42381654c0c3a97eb6054844e`. Bot-authored checks on that HEAD were reported as `action_required`, which is NOT a successful exact-head CI result.

This owner-authored documentation-only checkpoint requests authentic protected checks on the newest official branch commit. Treat source-proven CI on the prior HEAD as evidence, not as authority to merge this unverified new HEAD.

Merge only after the exact new HEAD's genuine required checks pass. Execute the existing guarded Education release; verify production 6-course catalog, all linked source/student/teacher pages, QR deep link endpoints and protected 401/403 gates. Record run IDs and results on issue #9862. Do not add or depend on redirects. Do not bypass repository protection.
