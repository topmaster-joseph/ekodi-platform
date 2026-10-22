# EKODI AI Provider Center · guarded five-tab release checkpoint (2026-10-23)

## Original functional change and official provenance

- User request: continue the EKODI Admin AI autonomous operations center UI modernization.
- Original authoring PR: #5661, superseded by official EKODI release-provenance recovery.
- Immutable functional source SHA: `bb1967678f5303b3c730be620b2b2f5054795870`.
- Official orchestrator task: `orch_recovery_bb1967678f5303b3c730be620b2b2f50`.
- Official recovery branch: `ai/chatgpt/orch_recovery_bb1967678f5303b3c730be620b2b2f50`.
- Official recovery PR: #5662.
- Source scope: `admin-provider-control.js`, `admin-readable-command.css`, `test/admin-ai-center-workspace.test.mjs`, `test/admin-provider-control.test.mjs`, `test/ai-provider-control-center.test.mjs`.

## Feature and safety boundaries

The AI Center presents operational readiness, provider/account connections, automatic routing, execution/audit evidence, and external services in five responsive accessible tabs. Cloudflare, GitHub, and Supabase external service controls are no longer duplicated below the AI provider workspace. PC-wide layout and mobile horizontally scrollable tabs are scoped to the visible AI Ops panel.

Unchanged runtime authority:
- Existing `/admin/accounts/audit-records` compatibility to `aiops`.
- Authorization, tenant scoping, privileged APIs, secret masking and server-side key storage.
- Free-first routing, paid approval, provider fallbacks, Human Gates, source-of-truth evidence.
- No database, DNS, Worker privilege or production configuration changes.

## Authentic CI regeneration and protected release

GitHub Actions generated the orchestrator recovery PR but GitHub may report bot-authored checks as `action_required`, which is not an executed, passing validation. This owner-authored **documentation-only** checkpoint asks first-party workflows to run authentic PR checks on the official branch. It does not certify the source as released or authorize bypassing any required check.

The source PR's functional tests completed successfully, but its draft-source merge-status reconciliation was not eligible, and its ordinary branch failed the required production provenance check. Both issues must be revalidated on this official recovery branch. The recovery workflow must own exact-SHA receipt checks, latest-main convergence, required checks, protected merge, staging promotion, rollback readiness and live authenticated PC/mobile verification.

Do not merge directly, bypass the orchestrator, weaken branch protection, or report staging/production completion without actual receipts and real live tests.
