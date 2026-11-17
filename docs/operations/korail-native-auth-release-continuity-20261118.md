# EKODI Korail native-browser authentication — guarded release continuity

Date: 2026-11-18 (Asia/Seoul) | Parent issue: #9876

## Release lineage
- User-approved work: extend and harden EKODI's own browser for the official Korail login; do not use personal Opera/Chrome profiles or send credentials to AI.
- Immutable source implementation: `9d1163439828aeefc0d288f9435bb1645c9b1bac`.
- Original implementation review: draft PR #9887; source workflow intake PR #9895, closed as superseded.
- First-party Orchestrator recovery task: `orch_recovery_9d1163439828aeefc0d288f9435bb164`.
- Official protected recovery PR: #9897, branch `ai/gpt6/orch_recovery_9d1163439828aeefc0d288f9435bb164`.
- The worker-source commit remains in recovery branch ancestry; never merge the original source PR directly.

## Why this documentation-only commit exists
The GitHub Actions bot generated the official recovery branch after source CI checks passed. GitHub marked branch checks `action_required` because bot-initiated events cannot start normal required workflows. This **owner-connected, documentation-only commit** asks GitHub to evaluate the actual official HEAD through genuine required CI and the EKODI AI Orchestration Gate; it must not forge status checks, change an approval, or bypass an orchestrator receipt. If main advanced, the canonical converger must synchronize and re-verify all checks at its new head.

## Release security boundary
- `https://www.korail.com/ticket/login` is the pinned first-party login source. Temporary local Chromium profile, super-admin action and on-device consent required. Password, OTP, cookies and user browser sessions remain private.
- New Agent capability `korailNativeAuth` must be verified on Windows Agent version 2.6.7 or newer. Older agents are refused by Control API and Admin.
- Login signal is conservative: correct origin and ticket path, complete page, no password input and a visible logout marker. Login status is **not** booking permission, seat availability, or ticket issuance.
- Read-only authentication result must contain no passenger names, ticket numbers, seats, prices, payment details, page text, cookies or hidden tokens. Session closes and deletes the temporary profile on explicit close, expiry or failure.
- No automated inventory polling, seat selection, ticket reservation, payment, CAPTCHA bypass or automated account reuse. Monetary commitment requires a separate Human Gate and Korail-provided permitted purchase flow.

## Required authoritative evidence
1. `EKODI AI Orchestration Gate` and `test` success **on the current official recovery HEAD**.
2. Windows Agent CI, native browser policy validation, protected release receipt, no parallel file conflict, Control API and Admin/Site Core staged guards.
3. Release via the official protected Orchestrator merge only; dispatch actual owning deployment workflows, confirm live `https://ekodi.kr` Admin/Control API assets and routing.
4. Validate Windows Agent auto-update and heartbeat `korailNativeAuth`, locally consented Korail login, correct official origin, logout detection and deletion of the temporary profile at session end.
5. Keep 2026-12-10 KTX 406 additional seat 13-5C and afternoon KTX 431 two adjacent seats as **unverified seat inventory** until Korail confirms. No reservation, payment, or ticket issued merely by this code release.
6. Record actual release SHA, deployment run IDs, endpoint results, PC canary and transaction confirmation only after each event is truly observed.

## Scope and data integrity
This document is release continuity metadata only. It does not authorize GitHub direct main writes, workflow status forgery, access/financial commitments, browser login without the person's action, or a claim of operational completion.
