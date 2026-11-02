# EKODI notifications — devotional publisher bridge (2026-11-02)

## Current behavior
- The verified EKODI Bible `PUT /api/bible/devotion` editor remains the publication authority. Authenticated super-admin status, canonical Scripture lookup, activity validation, and optimistic revision checking must pass before notification side effects.
- Only a **first successful transition into `published`** schedules a notification attempt. Drafts, unsuccessful saves, duplicate edits to already published content, and non-today dates do not send notifications. Today is computed in `Asia/Seoul`, preventing a scheduled future passage from leaking early.
- Bible Worker calls `notification-devotion-publisher.js` through `ctx.waitUntil`. Notifications use `POST https://ekodi.kr/api/notifications/events` with server-only topic-scoped credentials. There is no private cross-service D1 access and no browser credential.
- Publish an event separately to `church` and `mission` only if the corresponding explicit `NOTIFICATION_PUBLISH_CHURCH_ENABLED=true` or `NOTIFICATION_PUBLISH_MISSION_ENABLED=true`. Both default to off and require `NOTIFICATION_EVENT_SECRET_CHURCH` / `NOTIFICATION_EVENT_SECRET_MISSION`, each at least 32 characters.
- Event records are idempotent **once per service per date**. Notification recipients are still filtered by prior per-device opt-in and per-topic consent. No marketing or paid sender integration.
- Core event authentication supports topic-specific credentials: if a topic-specific secret is present in the central Worker, the legacy global event key no longer authorizes that topic. Other existing topics keep backwards compatibility.

## Mandatory deployment and security gates
1. Use EKODI Orchestrator protected release for both Bible and central API Worker. CI must verify the exact release SHA and protected merge, not only this source PR.
2. Verify central D1 notification migration is applied in staging and production. Confirm the `notification_events` table exists before enabling producers. Existing reader UX must remain public and usable without notification consent.
3. Provision **matching independent** 32+-character secrets in the Bible and central API Workers: `NOTIFICATION_EVENT_SECRET_MISSION` for the mission topic, `NOTIFICATION_EVENT_SECRET_CHURCH` for church. Do not expose or store values in Git, analytics, UI, client logs or PR bodies.
4. Leave both `NOTIFICATION_PUBLISH_*_ENABLED` unset/false until server-side auth, staged publication, unsubscribes and event fanout have passed. The feature flags belong only in Bible Worker secrets/vars; they are not subscription-consent shortcuts.
5. Confirm that a new approved devotion published **today in Seoul** creates at most one event per enabled service, while a tomorrow draft/published override creates none. Verify repeated edits do not resend. Avoid using real subscribers for synthetic tests.
6. Validate a revocation/draft transition before enabling meaningful production delivery. An already-delivered notification is not retractable; use a separate withdrawal workflow for content corrections.
7. Web Push remains independently off until VAPID credentials and real-device delivery pass. Inbox-only delivery can work without Web Push credentials but still requires an authorized event producer and consenting subscribers.

## Verification
`node --test test/notification-devotion-publisher.test.mjs test/notifications-core.test.mjs`
`npm run build`
`node scripts/validate-service-layer-boundaries.mjs`
`git diff --check`

**Completion definition:** protected source release merged, central and Bible Worker deployments successful, both default-off behavior and staging opt-in publication proven, enabled publishing explicitly authorized, and production API and actual consented device observations verified. A successful PR, build or HTTP 200 alone is insufficient.
