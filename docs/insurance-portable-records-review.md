# EKODI Insurance portable self-care records — privacy/security release review

Issue: #6568 (canonical old-origin migration), #6569 (API host consolidation), parent #6536.

**Status: candidate only, not enabled on live websites.** No customer migration or sensitive processing starts from this source alone. Only the EKODI Orchestrator's protected receipt, human security/privacy review and audited deployment may authorize an interactive migration workflow.

## Verified boundaries

- Current public URL: https://ekodi.kr/insurance.
- Historic origin: https://ins.ekodi.kr. Each host has its own localStorage; moving a hostname cannot move browser records.
- Browser record keys: ekodi-insurance-staging-v3 with legacy v2/v1 variants. The server consultation revocation capability lives at a separate key, ekodi-insurance-consultation-access-v1. Never conflate the two.
- The separate D1 consultation API may contain consented encrypted callback contact information. Local self-care transfer is **not** an API transfer.
- Current insurance product catalog remains closed for compliance; no suggestion, quotation, enrollment or advisor authorization is implied.

## Proposed portable archive protocol

Draft library: sites/ekodi-insurance/portable-records.mjs. This is not linked from either UI, imported by a worker, or deployed as an active API.

1. On the **legacy host**, a future explicitly user-clicked export control must explain what will leave the device. Default scope is only self-entered policy summaries and claim-preparation notes. Diagnosis and chat history each require separate opt-in and must be called out as potentially sensitive.
2. Local Web Crypto derives an AES-256-GCM key with PBKDF2-HMAC-SHA256, 600,000 iterations, random 16-byte salt and 12-byte IV. Authenticated additional data is bound to an archive format/version. Require user-provided passphrase (minimum 12 characters). **PBKDF2 is not memory-hard**; owner security review must assess a stronger supported KDF, offline attack resistance, device performance and password recovery before deployment.
3. No network or storage write by the library. The future UI must only offer a user-triggered encrypted file save and warn that losing the passphrase makes it unreadable. No plaintext export, query-string contents, URL tokens, analytics, logger data or server upload.
4. The **canonical host** must read a user-selected encrypted file locally, decrypt locally and validate version, parameters, sizes, field allowlist and row limit. Reject unknown top-level fields, malformed records and tampered ciphertext. Do not deserialize into app state blindly.
5. Show a count-only preview and existing-record conflict policy before the user confirms. Existing records win when IDs overlap. Preserve local consultation and revocation capability separately, and require explicit backup before writing any merged state. The pure merge returns a proposed copy but does not write localStorage.
6. Require recovery proof for malformed files, missing passphrase, interrupted browser migration, quota/low-memory devices, duplicated IDs, chat opt-out and token-protection. Do not automatically delete old-origin records after import.

## Explicit exclusions

- No names, callback contacts, raw server request bodies, submitted consultation records, transcript handoff copies, access/revocation tokens, cookies, accounts, authorization headers or unknown fields in the archive.
- No cross-origin postMessage, iframe, redirect, JavaScript origin bypass, service-worker relay or server-side migration.
- No silent downgrade or unbounded crypto parameters. No public preview of personal content without user authentication on the same local device.
- No change to API hostname, D1 records, paid AI or insurance advisor permissions.

## Mandatory approval/evidence before UI exposure

- Independent security and privacy threat review (KDF choice, plaintext memory, file/download handling, browser Content Security Policy, schema compatibility, compliance and consent copy).
- Legitimate source and target-origin browser tests, with synthetic non-real records, including offline operation and data-loss rollback.
- Storage merge/backup UX, explicit import action, client-side-only test, no contact or revocation capability leak.
- Exact-hash EKODI Orchestrator receipt, CI, review and protected release plus real production verification.
- Separate Human Gate for old-host retirement. Keep the old origin usable until migration is proven and users have an opt-in path.
- Handle the same-origin /api/insurance gateway separately under #6569 with auth, rate limits and CSRF controls.

## Scope now

This candidate implements the **standalone, side-effect-free crypto + validation + merge core and regression tests only**. The UI, link, download/import orchestration and old-host retirement are intentionally excluded pending security/privacy approvals. CI passing does not imply production readiness.
