# EKODI self-hosted devotional Web Push: guarded deployment contract

Status: code scaffolding only. Not deployed; no real-device receipt evidence.

## Ownership and cost
- EKODI Orchestrator owns subscription storage, queue, retry, consent, and send scheduling.
- Browser vendors' push gateways remain external and are generally free to use.
- No paid SMS/Kakao provider or metered paid messaging fallback without explicit owner approval.
- Existing ekodi.kr origin and infrastructure must be reused; do not introduce subdomains.

## Production prerequisites
1. Deploy reviewed SQL migration to the correct DB; confirm backup and rollback.
2. Generate VAPID P-256 keypair in an approved secure environment. Store private key as a server-only secret; never commit keys or log subscriptions.
3. Implement authenticated, rate-limited POST/DELETE /api/message/devotional-push with strict origin checks, site-level authorization, consent audit, endpoint hashing, and encryption-at-rest for endpoint and subscription keys.
4. Serve the service worker on ekodi.kr with a root-scope-compatible Service-Worker-Allowed header, or relocate it to the site root. Validate actual worker registration scope.
5. Implement RFC 8291 payload encryption and VAPID RFC 8292 signing in a trusted runtime. Do not send plain JSON to push endpoints. Use standard audited Web Push implementation.
6. Schedule 07:00 Asia/Seoul daily and verify devotion is public before sending. Claim delivery key atomically before send; retry transient failures with backoff, remove 404/410 subscriptions.
7. Add user-facing subscription and unsubscribe controls with explicit permission gesture. iOS Safari requires Home Screen installation for web push.
8. Verify Android and iOS real devices, denied permissions, offline delivery, retries, KST date rollover, duplicate prevention, and cancellation.
9. Use protected PR/CI/Human Gate and verify deployed origin before marking complete.

## Security review note
The prototype allowlist in message/devotion-push-validation.js must be revisited against actual push provider endpoint formats (including vendor changes). Do not enable production writes until server-side SSRF controls, DNS/IP validation, and outbound policy are audited.
