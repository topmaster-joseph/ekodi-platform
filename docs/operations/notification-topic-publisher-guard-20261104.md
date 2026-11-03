# EKODI notification publishing: per-topic credential and explicit allow-switch

Date: 2026-11-04 (Asia/Seoul).

## Security boundary
The central event ingress `POST /api/notifications/events` rejects tenant/service publication unless **both** are configured:
1. `NOTIFICATION_PUBLISH_<TOPIC>_ENABLED=true` in the central API Worker, and
2. `NOTIFICATION_EVENT_SECRET_<TOPIC>` with at least 32 characters.

The signed producer (the source service Worker, e.g. church/mission Bible service) must also have its own matching secret and its own publish flag. A secret for a different topic cannot grant access; a browser `Origin` always denies event publication. The former `NOTIFICATION_EVENT_SECRET` global shared secret has no publishing authority (legacy fallback removed). No migration changes or service-specific data exposure are introduced. A valid event must still match its topic/service and canonical path.

The existing role-protected admin summary now exposes a read-only `publisher` status per topic with `enabled`, `credentialsConfigured` and `ready`. These booleans are safe status indicators and never disclose keys. The same status is visible in the existing common administrator tabs and in the already authorized site manager notification counters. It is NOT an activation control.

## Deployment and rollback
1. Before rollout, verify whether any active producer depends on the obsolete global key. If so, provision the topic-specific per-service key through EKODI's authorized secret-management lane and leave the topic publish flag disabled until the matching producer is ready.
2. Do not pass secrets in PR comments, logs, source files, browser JS, or user-visible responses. For each service, match the key only through server-side configuration.
3. Run `node --test test/notification-publisher-isolation.test.mjs test/notifications-core.test.mjs test/notification-devotion-publisher.test.mjs test/notification-admin-summary.test.mjs test/notification-tenant-scope.test.mjs test/tenant-notification-admin-ui.test.mjs test/admin-communication.test.mjs`, full build, D1 additive guard, service-layer and admin source validators.
4. EKODI Orchestrator issues the official recovery PR, verifies authentic required checks, merges protected main and performs guarded Control API and shared admin/site rollout. Direct source PR merge or owner-less deployment is forbidden.
5. In production, confirm an unauthorized POST event is 403 and a topic-enabled sender cannot cross tenant. Verify the existing in-app subscription and status API still work without enabling Web Push. Test real devices only after explicit end-user opt-in, valid VAPID keys and release gate.
6. Rollback: restore the previous Control API release with the EKODI release authority; do not add legacy shared-key bypass as a hotfix.

The status `ready=true` means the topic flag and key are configured; it is not proof that users received or read notifications. Actual sender and live-device tests are separate.
