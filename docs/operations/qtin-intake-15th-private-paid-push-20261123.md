# QTIN application window and private paid-order phone notifications (2026-11-23)

Tracking: [#10258](https://github.com/topmaster-joseph/ekodi-platform/issues/10258)

## Contract
- KST monthly intake: **15th 00:00:00–25th 23:59:59** for next month's QTIN issues, on both `/qtin/church` and `/qtin/mission`. Future campaigns use the new default, and persisted rows matching exactly the historical 20th–25th default are normalized in reads and safely reconciled on scheduler/admin access. Customized windows and `force_open`/`force_closed` are untouched.
- Accept only Toss-confirmed `status=DONE` with matching order and amount, followed by a successful first transition to `qtin_orders.status=paid`; ignore pending, forged webhooks, mismatches, replay, and `QTINTEST-` simulated orders.
- On new real paid orders, insert an idempotent **PII-free** outbox key (order ID only), then call the existing private `ekodi-auth-api#OperatorNotifier` through `OPERATOR_NOTIFY` service binding. The notice has a generic subject, issue month, org, book count, total and a fixed authenticated admin destination; no buyer name, phone, email, payment key or receipt token.
- Outbox `status=sent` requires `result.push===true` (gateway acceptance), not email-only success. Failures are retried with a bounded exponential backoff via the existing 00:00/12:00 KST QTIN Cron; an in-progress 5-minute lease prevents simultaneous normal sends. A crash after accepted push but before outbox acknowledgment may require a repeated alert; exact-once delivery across two systems is not claimed.
- QTIN `QTIN_OPERATOR_NOTIFY_ENABLED=true` is scoped only to the production Worker; isolated staging never has the binding and can never send the production operator alert. Does not touch public notification subscriptions, paid SMS services, or PG keys.

## Deployment order / guardrails
1. Orchestrator-verified PR and CI, isolated staging, then **Control API release** to allow the trusted `qtin` source.
2. Apply additive `migrations/0205_qtin_operator_notice_outbox.sql` to canonical D1 `ekodi-auth` (after restoration checkpoint); deploy QTIN Worker with the private service binding.
3. Read-only production check: `/qtin/api/catalog`, `/qtin/api/health`, `/qtin/church`, `/qtin/mission`; compare KST dates and verify public/admin boundaries. Do **not** create a real purchase or a public push merely for a probe.
4. Operator one-time phone consent: log in to `https://ekodi.kr/mail/admin#setup` with an allowed operator account, register private phone push and run **휴대전화 알림 시험**; verify on the physical phone. Android/iOS browser and OS notification permissions must allow delivery. A `2xx` gateway response is *not* a phone-receipt proof.
5. Live purchase notifications require valid live Toss keys configured as Worker secrets. Repository `test_ck_` is intentionally operator-only test mode. Read-only health/key readiness must be confirmed independently; **never claim that customers can pay real money or that phone received the push from code alone**.

## Regression tests
```sh
node --check qtin-order-core.js
node --check qtin-order-worker.js
node --check operator-notify.js
node --test test/qtin-order.test.mjs test/operator-notify-entrypoint.test.mjs test/operator-push.test.mjs
node scripts/validate-additive-migrations.mjs
```

## Rollback
Set `QTIN_OPERATOR_NOTIFY_ENABLED=false` through protected release to stop private alerts without touching payments or existing orders. Use orchestrated revert for date changes. Never delete customer/payment rows or outbox until retention and audit policies allow.
