# EKODI unified notifications — phase 1 (2026-11-02)

## Boundaries
- Central notification capability through canonical /api/notifications mission-control entry. Service events and consent remain service-owned.
- Public /notifications/ opt-in UI and a scoped Service Worker. No imported subscriber roster, no advertising consent.
- D1 device, event, and delivery ledgers are separate from Messenger and payment tables.
- Device bearer token is generated in the subscribing browser. It is not proof of EKODI account identity and must not be automatically linked to a person without authenticated consent.
- No production sending without deliberate owner activation. Existing paid SMS/Kakao/email untouched.

## Operator activation gates
1. Deploy migration migrations/202611020100_notification_core.sql on staging and validate before production.
2. Generate a P-256 VAPID keypair. Store NOTIFICATION_VAPID_PRIVATE_JWK as an encrypted Worker secret. Configure the matching base64url uncompressed public key as NOTIFICATION_VAPID_PUBLIC_KEY. Never commit secrets.
3. Configure random NOTIFICATION_EVENT_SECRET of at least 32 characters as a Worker secret, shared only with server-side producer services.
4. Keep NOTIFICATIONS_SEND_ENABLED unset/false until staging and real mobile-device tests pass. When set to "true" with valid VAPID credentials, opt-in and scheduled deliveries are available.
5. Test Android Chrome, desktop Chrome/Firefox, and iOS 16.4+ Home Screen Safari; verify allow, deny, unsubscribe, topic change, 404/410 invalidation, reload and deep-link routing.
6. Ten-minute scheduler: max 3 newly fanned-out events per run, max 5,000 recipients per event, max 12 send attempts per run. Higher throughput needs an approved queue/backpressure design.
7. First-party server producers may POST /api/notifications/events with x-ekodi-notification-secret and JSON {idempotencyKey,serviceId,topic,title,body,targetPath,scheduledAt?}. Topic must match serviceId, path must belong to that service. Never put the event secret into browser code.
8. Confirm staging receipts, production release provenance, real device delivery and runtime logs before claiming operational status.

## Routes
- GET /api/notifications/config — safe topic catalog and public key.
- POST /api/notifications/subscription — origin/consent/subscription validation.
- GET or PATCH /api/notifications/preferences — device token and per-topic preferences; PATCH requires same-origin.
- GET /api/notifications/inbox — device-token scoped most recent 30 notifications.
- DELETE /api/notifications/subscription — deletes consent/subscription and delivery records.
- POST /api/notifications/events — secret-authenticated server-only event ingress with idempotency.

## Guardrails and next increment
- HTTPS push endpoints restricted to known Apple/Google/Mozilla/Microsoft push service hosts.
- VAPID ES256, ECDH+HKDF and AES128GCM; no external paid sender SDK.
- No personal or payment details in notifications. Target links are service-scoped relative paths. No marketing sends.
- Changed topic cancels pending deliveries; send selection checks current consent. Unsubscribe deletes device records.
- Retry is bounded, failed/expired endpoints tracked. D1 rows are evidence of attempts, not device read receipts.
- No automatic devotional event producers yet. Link church/mission publication and recurring meeting publishers only after authoritative publication scheduling and opt-in checks.
- Add tenant-admin UI, authenticated account-linking, consent audit export, retention policies, and broadcast scaling in follow-up implementation.

## Verification
- node --test test/notifications-core.test.mjs
- node --check mission-control-entry-worker.js
- npm run build
- node scripts/validate-additive-migrations.mjs

A task PR alone does not deploy. EKODI orchestrator must issue release provenance and carry out governed merge, migration, staging, rollout, and real device confirmation.
