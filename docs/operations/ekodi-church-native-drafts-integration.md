# EKODI Church Native Google Docs and Slides — draft executor adapter

EKODI Orchestrator owner, continued from automation handoff issue #6895. This is a **first-party runtime adapter** for native worship drafts, not a ChatGPT/OpenAI task. The file `scripts/ekodi-native-worship-google-drafts.mjs` is **not yet wired into a deployed authenticated EKODI Worker**. Code and mock API tests are NOT proof that any live Google document has been created.

## What is implemented

- Validates an exact `ekodi:church-weekly:YYYY-MM-DD` job, source registry status `approved` and the matching scripture reference. It does not invent Bible text or claim pastoral approval from a daily devotional registry.
- Requires separately generated **actual input text** for sermon and bulletin, plus 3–40 slide bodies. Missing text fails closed; the adapter does NOT fabricate a sermon.
- Authenticated EKODI authority callback must verify user is pastor/super-admin, service=church, and an **approved private** Church Drive folder ID. A public or unverified Drive folder is denied.
- Requires EKODI Storage server-provided Google OAuth access token with `drive.file` scope. OAuth credentials must remain encrypted in the existing EKODI Storage D1/secrets infrastructure, never appear in job payloads, logs, GitHub artifacts, web pages or this repository.
- Requires an atomic, durable `ledger.claim(jobId)` before writing. Use a unique SQLite/D1 claim and long-lived idempotency key. If the claim fails, do not create any documents.
- Creates three Google Workspace native files in the verified private folder: **sermon Google Doc**, **bulletin Google Doc**, **worship Google Slides presentation**. Uses Drive files.create (Google native MIME type), Docs documents.batchUpdate, Slides presentations.batchUpdate, and GET readback. Each external file ID is durably stored immediately after creation and again after content readback verification.
- Failures are **reconciliation-required**. Do not automatically retry an uncertain external POST, even after request timeout, because Google might have created an unseen file. Persist issue, inspect Drive and ledger, then explicitly reconcile before another run.
- Result is `draft_ready_for_pastor_review` and `canDisableChatgptTask=false`. No public Church worship publication, Google sharing, notification, payment, eBook sale, service login, permanent approval or automatic cutover happens.

## Production integration still required

1. EKODI Storage: add an internal-only token broker using existing encrypted credential vault and verify drive.file authorization, canonical Church folder `EKODI/02_CHURCH` and that the specific target folder is **not shared publicly**. For sensitive drafts, prefer a dedicated pastor-only subfolder. Turn on Google Docs API and Google Slides API in the same Google Cloud project; reauthorization may be needed.
2. EKODI Orchestrator: build the server-only authority callback backed by verified EKODI identity/role; never accept `verifiedServerSide`, `folderPrivateVerified` or `targetChurchFolderId` from the user's HTTP body.
3. Durable claim/store: D1 or equivalent encrypted persistence implementing `claim`, `record`, `finish`, `block`; enforce `UNIQUE(job_id)`, atomic conditional claims, owner-only leases, full audit and document IDs. Handle partial failures with explicit manual/approved reconciliation.
4. Authorized content writer: compose the actual sermon text, bulletin and worship slides from the approved scripture and pastor's instructions. Different AI providers may assist if the EKODI Orchestrator explicitly approves usage; avoid automatic external API cost and never claim generated text as a pastor-approved interpretation.
5. Google asset-level readback and sharing audit: validate Google Docs/Slides IDs, folder ACL, true content; keep drafts unpublished until human pastor/owner approval. Google sharing and publishing are separate later tasks.
6. Stage in a dedicated approved Google test folder and EKODI test service identity, then verify real Docs and Slides UI on desktop/mobile. Exact SHA CI, Orchestrator protected merge, staging and production only after evidence.
7. **Only after native equivalent full weekly workflow and owner approvals are proven** may the ChatGPT weekly worship automation be disabled; never on a successful connector test alone.

## Known limitations

This adapter intentionally does not implement approval, OCR, audio insertion, notification sending, Bible passage API copying, permanent token/credential storage, or authoring the content from scratch. It cannot prove the 4 legacy task cutovers. It is not safe to pass arbitrary browser-supplied server permissions or private folder IDs to it.

## Commands

```sh
node --check scripts/ekodi-native-worship-google-drafts.mjs
node --test test/ekodi-native-worship-google-drafts.test.mjs
```

All tests use mocked Google API calls. No live API mutation from CI.
