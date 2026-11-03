# EKODI O2O Connection Hub · phased implementation

Task: EKODI-O2O-001 · 2026-11-03
Owner: EKODI Orchestrator; ChatGPT is an implementation and verification worker, not release authority.
Release boundary: existing Shared Site Core (no new subdomain, worker, tenant or release lane).

## Verified implementation scope (task branch only, until guarded release)
- Canonical public preview route: /o2o, GET/HEAD only, noindex, local-only QR generator, no personal-data collection API.
- Six public destination families: /ekodimission, /cgma, /edu, /ekodibooks, /ekodimall, /seonammedi.
- Deep links are constrained to the selected site's public path, a small list of functional query keys, and canonical https://ekodi.kr. Cross-host links, scheme-relative links, private/administrative paths, token-like query keys and control characters fail closed.
- Existing vendored, locally served QRCode.js is reused with its license. QR can be copied as a short Korean message, exported with scan quiet zone, and printed. A text link remains visible if QR is unavailable.
- No new point award endpoint, identity merge, consent bypass, auto-apply or check-in.
- Public page explicitly states that a QR open is not an application, attendance, purchase or points award.

## System-of-record alignment
- Person: public.people and private contacts; Activity: public.activities; participation: public.activity_participations; audit: public.activity_participation_audit (see ACTIVITY_ENGINE.md).
- Existing Mission public application and authenticated tenant operator functions remain the only participation lifecycle controls.
- Verified attendance point awarding stays in ekodi_points_private.award_verified_attendance, reached only through the restricted ekodi_points_operator_award_attendance contract after tenant/local authorization, audit proof and daily cap checks.
- QR URLs are not identity or presence proofs. Never derive attendance, payment, points or a sensitive relationship from scans, clicks, page views or AI statements.

## Site service settings
- Reuse tenant-scoped tenant_site_service_catalog_snapshot and tenant_site_service_preference_set once O2O operator controls are production-ready.
- A menu-visible preference does not grant role access, turn on external integrations, or enable points. Do not register a misleading ready admin capability until a real tenant-scoped operator workflow and tests exist.
- Keep global admin context separate from tenant-local roles. Service-specific activities and contact data stay within their original tenant.

## Follow-on slices (not claimed as implemented by this change)
1. Operator-issued campaign QR: tenant-authenticated, audited create/revoke/list; public projection without contact details; revocable links; use existing event/application IDs, not a second activity ledger.
2. Actual attendance confirmation: canonical tenant-scoped operator check-in and audit proof before optional point award, with rate limits and anti-replay.
3. Measurement: opt-in aggregated QR-origin visits versus confirmed applications/attendance, no unnecessary device identifiers or cross-tenant profiling.
4. OpenAI-assisted field work: use existing EKODI AI Gateway and model/provider registry for text/voice assistance, transcription and approved summaries. Consent-gate recording, redact data, enforce budgets, provide human fallback. Never expose provider keys.
5. Site operator UI: integrate with existing service settings and activity tabs without duplicate navigation or broader permissions.
6. Automated follow-up: only for recipients who consented, through existing notification and messaging preferences, not manipulative retention optimization.

## Pilot field plan
- Mission: Saturday gathering public deep link to canonical application, human check-in, optional verified reward and consented weekly follow-up.
- Cheonggye: five opt-in merchants with public storefront/menu QR; purchase proof must come from actual orders/POS.
- Education: farmer training QR links to class content; publication requires human verification and existing commerce boundaries.
- Later: books, mall, civic participation using the common public link validator and separately verified service-owned workflows.

## Release, monitoring and rollback
- Unit security tests for URLs, HTTP methods, privacy language, assets; build; architecture, boundary, security, constitution, mission, UI DNA, design engine, deployment validators.
- Visual QA at 320, 390, 768, 1366 and 1440px: QR present, zero horizontal overflow, tenant selection, malicious URL denial. Test actual production only after orchestrator release.
- Use isolated ai/chatgpt/<task-id> task PR; only orchestrator-issued recovery/promotion PR merges and deploys. No manual production deploy.
- Rollback through guarded release revert of the new route and assets. No schema migration or side effects in this slice.
- Do not label the platform or follow-on slices live or complete without independent production functional checks and auditable receipt.
