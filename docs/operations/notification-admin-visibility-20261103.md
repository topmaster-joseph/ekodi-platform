# EKODI notification administration — private operational counts

## Design and ownership
The existing common admin communication section includes a third **알림** tab. It reuses EKODI's existing admin Shell and shared session identity, not a duplicated admin page, new subdomain, or standalone login. Other communication tabs stay available.

The authorized read-only endpoint is `GET /api/notifications/admin/summary` with optional `?topic=<registered topic>`.
It calls the canonical `/api/session` fast-path on the existing D1 admin session, and requires `super_admin`.
Any absent/expired session or site-admin token is rejected. **Site admins are not yet authorized to access cross-site aggregates**; expanding to own-site-only requires verified site/workspace membership mapping and separate regression tests.

The API exposes only per-topic counts: active subscriber **devices** (not people), accepted events, event pending count, delivery attempts by outcome, and runtime push readiness. It does not expose recipient emails, endpoint URLs, private keys, tokens, notification body/title, or raw subscriber records. All responses use `Cache-Control: no-store`.

The existing `communication-admin.js` panel presents Mail, Live and Notification tabs, with a manual refresh control and a link to the existing public opt-in page. The panel is not a second status summary in the upper-right corner and does not present fake or static figures.

## Important metric semantics
- Subscriber count represents active **browser/device registrations**, not verified unique persons.
- Delivery `delivered` represents server-inbox state or push transport acknowledgement. It **does not** prove that a human saw/read a push.
- No UI control turns on VAPID, automatic event production, paid messaging, or wider permissions.
- When unavailable the panel fails closed, showing an access/connection error instead of invented zeros.

## Regression and rollout
1. `node --test test/notification-admin-summary.test.mjs test/notifications-core.test.mjs test/admin-communication.test.mjs`
2. `npm run build`, additive migration guard, source diff check and full mandatory CI.
3. EKODI first-party issue of an official `orch_recovery` PR, current-base checks, protected merge.
4. Guarded Control API and shared admin/static shell releases with production provenance.
5. Production: logged-out request to admin endpoint denied; site-admin denied; super-admin response topic-scoped and free of personal data. PC/mobile admin tabs should load and refresh without duplicate headers or menu items.
6. Continue server-only publisher secrets, provider activation and real push delivery under their existing separate guards. No claim of actual push sending from this dashboard release.

A source PR is not a release. Never merge the task PR directly.
