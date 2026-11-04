# EKODI Mission Saturday reminder — guarded internal notification producer

Date: 2026-11-04 (Asia/Seoul)
Task: ai/chatgpt/mission-notice-20261104
Canonical site: https://ekodi.kr/ekodimission

## Source of truth
Use the existing public, first-party meeting endpoint `GET https://ekodi.kr/ekodimission/board/api/saturday`. Its response includes `meeting.date`, `meeting.time`, `meeting.status` and `meeting.venue`. Only `meeting` is used by the reminder; replies, attendee names, personal accounts or contact data are never copied into an event or logged. No new event/meeting database, tenant registry or independent service is introduced.

Current event series includes a one-off November 7, 2026 time of 17:00, while other weekly meetings default to 11:00. The scheduler never assumes the default. An upcoming meeting MUST be exactly the following Saturday, must have `status=scheduled`, and must include a valid local time and non-empty public venue. Cancelled, completed, stale, shifted or missing calendar entries MUST NOT enqueue an event.

## Scheduling and consent
Reuse the canonical Control API worker's existing `*/10 * * * *` Cron and its signed `POST /api/notifications/events` ingestion logic. The reminder check runs **only Friday 09:00–09:59 KST**, deriving the Saturday date in the Asia/Seoul timezone (UTC+9). An identical idempotency key `mission:saturday:<YYYYMMDD>:reminder` is reused on each retry and even if the published start time changes, preventing duplicate messages. The event links to the public canonical participation view `/ekodimission?meeting=YYYY-MM-DD#saturday`.

The central event API determines the actual event queue and its subscribers. Only devices which explicitly opted into the `mission` topic receive an in-app inbox entry. No email/SMS, payment, new privilege, unsolicited device enrollment, or Web Push is introduced. The subscriber's ability to opt out remains unchanged. Server-reported `delivered` must not be interpreted as an actual read receipt.

This reminder has THREE independent readiness conditions:
1. `NOTIFICATION_MISSION_SATURDAY_NOTICE_ENABLED=true` (campaign-specific Cron gate).
2. `NOTIFICATION_PUBLISH_MISSION_ENABLED=true` (existing per-topic event gate).
3. `NOTIFICATION_EVENT_SECRET_MISSION` (isolated server-only secret at least 32 characters).

Every gate defaults OFF or unavailable, including an explicit `NOTIFICATION_MISSION_SATURDAY_NOTICE_ENABLED = "false"` in `wrangler.api.toml`. Do not turn on live publication until the user/authorized platform release lane has reviewed the event copy, corresponding prior explicit consent, correct endpoint, secret management, and a production release check. For now, **keep actual production publication disabled**. The read-only admin summary exposes campaign readiness booleans for mission, with no secret values.

## Correctness safeguards
- GET calendar source is fixed and public; no caller-specified URL or arbitrary redirects are used. Failure to fetch/parse its data causes a fail-closed result; there is no fabricated weekly event fallback.
- Event is injected only through the existing topic-specific signed handler, which enforces service-topic parity, idempotency key length, text length, target path, and event-queue constraints.
- Duplicate Cron runs converge via D1 `INSERT OR IGNORE` on the same idempotency key. 
- The event body is an event schedule, not a promise of physical attendance. Only public fields from the current official calendar are used.

## Release evidence required
Run `node --test test/notification-saturday-publisher.test.mjs test/notification-publisher-isolation.test.mjs test/notifications-core.test.mjs test/notification-devotion-publisher.test.mjs test/ekodimission-saturday.test.mjs test/notification-admin-summary.test.mjs test/notification-tenant-scope.test.mjs test/tenant-notification-admin-ui.test.mjs test/admin-communication.test.mjs`.
Also verify `npm run build`, D1 additive migrations, service boundaries and admin source validators, source whitespace and release policy.
Publish a task PR, allow EKODI Orchestrator to issue an `orch_recovery` provenance PR, require authentic current-head CI, merge under protection, guarded staging/Control API/Shared Site deployment and live production checks. Production test must show public calendar/opt-in screen HTTP 200, unauthenticated admin/event POST HTTP 403, visible campaign readiness *OFF*, and no accidental real deliveries. Real authenticated site-manager and live-device receipt checks remain pending unless legitimately available.
