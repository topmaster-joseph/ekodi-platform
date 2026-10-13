# CGMA native-agent authenticated write canary — security and readiness contract

**Status: AUTH_REQUIRED / intentionally not enabled for production writes.**

The existing CGMA native background browser checks **public GET only**. The admin-page one-click CRUD smoke uses the administrator's *own current* session and is **not** a native-agent execution. Node SQLite fixture tests are not production E2E evidence.

## Fixed scope and explicit boundaries

- Task type: `board.cgma.authenticated-crud.verify` (reserved; protected hybrid queue returns `AUTH_REQUIRED` without enqueueing).
- Origin: `https://ekodi.kr`; target board `site:cgma:main` only.
- Dedicated, ephemeral, non-interactive EKODI-native browser; no user tabs, host credential storage, clipboard, reused Google cookies, hardware-backed account impersonation, or externally attached Hyper-V guest.
- A human-approved, **server-issued and server-verified** one-use canary capability is required. A client-provided `grantRef` string, a signed-looking receipt, or a job `confirmed:true` is **never sufficient**.
- Grant must be bound to the verified principal, board-local authorization, isolated node identity and canary scope; monotonic nonce, <=2-minute lease, replay-proof D1 consumption, disabled pending explicit administrator approval. No automatic production write schedule.
- Only a newly created, uniquely identified canary test post may be changed. Never touch an existing user post, membership, board category, or business content.
- Mandatory health/board identity; anonymous 401/403; 201 create, 200 read, 200 edit, 200 read, 200 soft-delete, 404 deleted read, public-list nonvisibility. Audit events: `post.create`, `post.edit`, `post.delete` verified by the **authoritative service**, not by an agent assertion.
- On failure, the executor may clean up **only the positively matched post it created** and must report an unresolved canary if it cannot safely do so.
- Receipt must identify task, device pseudonym, virtualization backend, lease, scoped grant ID, post ID, exact step HTTP statuses, authoritative audit evidence references, clean-up state and finish time. Logs must never include raw session tokens or private body text. A structurally valid receipt **does not prove** production success.
- Do not weaken the `config/isolated-desktop-backend-policy.json` network isolation or claim the offline Hyper-V guest can make production requests.

## Remaining implementation gates

1. Implement a trusted Control API endpoint that issues a one-use delegation **only** after genuine EKODI/CGMA board-local authentication, explicit human consent, origin/board/node scope verification and D1 anti-replay storage.
2. Implement a dedicated native executor registered for the new capability and narrow origin; no clipboard or main-user profile. It must consume the grant through trusted server mediation, not receive a bearer/session token.
3. Add authoritative CGMA board-side grant consumption, per-job idempotency, and audit lookup in the board service. The server must verify the final receipt against D1 audit data before marking the queue job `completed`.
4. Run in isolated tests, then protected CI, staging and canary on a single authorized node with the device lease and explicit owner confirmation. Require actual production post creation/edit/soft-delete and authoritative audit evidence. Only then change this contract from `delegation_not_configured` to enabled.
5. Until all of the above pass, return **AUTH_REQUIRED**. Leave issue #4086 open; do not substitute the existing synthetic Chromium or SQLite results for authenticated native-agent proof.

## Current safe preparation

- `cgma-native-canary-policy.js` defines immutable scope and validates credential-free grant/receipt shapes.
- `hybrid-execution.js` reserves the task type, requires super-admin authorization/confirmation, but fails closed with `AUTH_REQUIRED / CGMA_NATIVE_WRITE_DELEGATION_NOT_CONFIGURED` before enqueueing.
- `test/cgma-native-canary-authorization.test.mjs` prevents credential transport, target widening, fake completion and missing cleanup/audit evidence.

This is a **readiness contract**, not a claim that a privileged production agent is already capable of or authorized to mutate the CGMA board.

**Release verification note:** GitHub bot-authored merge synchronization can yield `action_required`; only a real owner-authored commit and successful required checks may unblock the protected merge. Never disable those checks.

## 2026-10-13: isolated D1 grant storage milestone (not production authorization)

A server-only library cgma-native-grant-store.js now holds a short-lived D1
one-use lease state machine. Isolated Node 24 / in-memory SQLite tests cover
device binding, principal identity, CGMA board scope, consent freshness,
expiry, double-consumption, concurrent consumption, revocation and payload
credential rejection.

**This stage does not enable privileged native board writes.** There is no
HTTP grant issuer, no device-side authorization, no production migration,
no authoritative audit attestation, and no change to hybrid queue's
AUTH_REQUIRED / CGMA_NATIVE_WRITE_DELEGATION_NOT_CONFIGURED safeguard.

Before any production grant issuance, a trusted server handler must independently
verify EKODI session, CGMA board-local owner/admin membership, explicit
consent, isolated device identity, bounded lease, and authoritative board
audit events. Never accept client-supplied attestation booleans as proof.
A grant reference with nonce is not a bearer credential and never grants
native agents direct access to protected CGMA write endpoints.

## D1 authoritative audit verification milestone (not an enabled native writer)

New server-only module cgma-native-audit-evidence.js validates a native
canary receipt against independently queried D1 grant, exact test post,
soft-delete state, and post.create -> post.edit -> post.delete audit IDs,
actors and timestamps. It enforces the two-minute consumed lease and
compares audit references to actual server rows; device-provided evidence
alone cannot pass. In-memory SQLite tests cover valid and forged receipts,
missing rows, wrong author/content, nondeleted posts and expired lease.

The agent queue still returns AUTH_REQUIRED. The code does not provide a
public grant issuer, a trusted device-to-server grant consumer, audited
production data migration, or a legitimate authenticated production
session. Remaining server integration must verify board-local authorization
and user consent and must never trust client-supplied attestation booleans.
