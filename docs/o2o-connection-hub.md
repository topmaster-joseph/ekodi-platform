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


## 2026-11-04 incremental tenant operator implementation (EKODI-O2O-002)

Implementation branch: ai/chatgpt/20261104-o2o-tenant-ops-5c21.

- Existing Shared Site Worker now owns GET/HEAD /o2o/go/{opaque code}, with strict noindex/no-store and same-origin public URL validation. Revoked, expired and unknown codes fail closed. No scan writes or attendee profiling.
- Existing workspace site service settings render a subordinate tenant-owned QR operator panel; no duplicate administrator sidebar/service exists. A server-authorized operator may issue and revoke a 7-, 30- or 90-day QR and check the database snapshot after mutation. Token exists only in the issue receipt; database stores SHA-256 digest.
- An additive Supabase schema is prepared through CLI-generated migration 20261103165945_o2o_tenant_operator_qr.sql. RLS is enabled, private tables have direct grants revoked, issue/revoke/snapshot RPCs accept authenticated calls only and independently require current tenant-local operator scope. Public resolution returns a minimal site ID + destination projection only.
- DEV/PROD preflight discovery: DEV has tenants and current_site_activity_contexts but not the canonical activity table/operator helper; PROD has both. The new schema intentionally depends on the existing common site context only, and leaves the separate canonical attendance lifecycle unchanged. No production table was written directly by this development task.
- A new protected deploy-o2o-qr-schema.yml workflow validates new schema on PR, and accepts schema promotion only on immutable main SHA via exact orchestrator release receipt, production environment gate, DEV-before-PROD apply and independent RLS/RPC/grant proof. It does not deploy simply because source code merged.
- Tests: new tenant operator routing/API/schema tests plus existing O2O and workspace route tests; synthetic Chrome operator issue/revoke/QR verification at 320, 390, 768, 1366, 1440px.
- Blocker to declaring feature live: orchestrator-issued PR merge; guarded Shared Site Worker deployment; explicit authorized schema promotion on DEV and PROD; production operator identity tests with tenant-local account; verify issued link before and after revoke; observability receipt.
- High-risk areas remain excluded: autonomous check-in, activity points, customer/merchant targeting, notifications, voice recording, payment or account identity inference. A QR visit remains navigation only; the canonical activity ledger alone can verify attendance with required audit proof.


## 2026-11-11 O2O performance and reliability upgrade (EKODI-O2O-003)

Owner: EKODI Orchestrator. Existing Shared Site Core, public /o2o route and site-operator settings only. No new subdomain, personal analytics, user tracking, database schema, payments or automatic attendance.

### Performance changes
- **In-flight de-duplication on /o2o/go/{token}:** simultaneously resolving the same token, Supabase connection and publishable-key identity shares one pending read (bounded to 96 distinct concurrent keys per Worker isolate). The map is cleared on completion/failure. No positive, negative, revocation or expiration result is stored or cached. Every subsequent scan makes a new Supabase lookup; operator revoke remains authoritative.
- **Safe diagnosis:** Server-Timing: o2o-resolve;dur={milliseconds} on completed lookups; never includes a code, destination, user ID or sensitive tenant datum. Strict same-origin validation, private/no-store, noindex, HEAD behavior and existing 4.5-second upstream timeout preserved.
- **Public static assets only:** four public O2O files use Cache-Control: public, max-age=120, stale-while-revalidate=30. The /o2o HTML, issued QR redirects, authentication and other public assets retain their existing policy. Short propagation window for hotfixes.
- **First-load parallelism:** preload the bundled QR generator and modulepreload the O2O client in the HTML head. Same-origin vendored assets; no external provider.
- **Mobile QR rendering:** 256x256 canvas rather than 320x320 (36% fewer rendered pixels). Print/download export retains 768px white background, high-contrast QR and quiet zone. Repeated form submit with unchanged destination reuses the QR canvas.
- **Editable destination safety:** on an input edit the previously valid QR and href are invalidated immediately; a 220ms debounce avoids per-keystroke redraw. No personal input values are recorded or sent to the backend.

### Verification, rollout and rollback
- Node tests: test/o2o-performance.test.mjs, test/o2o-hub.test.mjs, test/o2o-routing-reservation.test.mjs, test/o2o-tenant-operator.test.mjs.
- Tests cover 24 concurrent same-token reads -> one upstream read; a later scan and a revoked response -> fresh DB calls; separate tokens are distinct; errors recover; HEAD error is bodyless; static-only short cache; HTML/token responses stay no-store; editable public link invalidation.
- Run platform security, architecture, boundary, constitution, mission, UI/design, deployment checks and the release build. Check 320, 390, 768, 1366, 1440px in an authorized browser after deployment. Do not claim real-life LCP or latency improvements without measured production evidence.
- Orchestrator must handle PR conversion, mandatory checks, protected merge and deployment. Rollback is a protected source revert; no schema rollback.
- **Previous independent blocker:** PROD may still lack o2o_campaign_links and o2o_public_resolve. This performance change does not activate that schema or authorize bypass; see issue #8568.
