# EKODI Publishing — Jubilee Theology review-9 private asset intake

Controller: **EKODI Orchestrator**. Parent #6331, editorial #6522, draft implementation PR #6638. Date: 2026-10-30.

## Handoff status (do not confuse with ingestion)
- **Prepared and byte-verified outside the repository**: `EKODI_희년신학_9차_에코디출판_비공개이관패키지.zip`, 2,883,756 bytes, SHA-256 `b9e582e4767665a8d72bb312d6a1aee3d4d1738be5558fadab194d75bb770fca`.
- Package has **six manuscript artifacts** (Word/EPUB/PDF for each volume) and **three editorial reports** (footnote review, technical fingerprints, publishing QA). A UTF-8 `manifest.json` lists exact relative names/lengths/digests. No binary manuscript or private storage URL is committed to this repo.
- **Local source files verified**, but no authenticated EKODI Publishing private R2/Drive upload and readback receipt. Therefore `currentWorkflowState=private-handoff-ready-awaiting-authenticated-ingestion`, not `private-editorial-ingested`. Do not represent the package SHA as author approval or copyright clearance.
- Current private draft metadata: `publishing/jubilee-series/draft-registry.json` revision `review-9`. Archive fingerprint/expected edition hashes: `publishing/jubilee-series/review-9-private-handoff-intent.json`. Its contents are metadata only. Historical `review-8-evidence.json` retained.

## Verified next handoff transition
1. **Authorize** the publisher ingestion agent using verified EKODI Orchestrator service identity. Use an isolated private object store; reject public presigned or public catalog writes. Do not use GitHub/Actions artifacts, client-side approval flags, or an unofficial browser service.
2. Receive ZIP over the authenticated channel, check archive SHA-256 above and ZIP integrity, extract into a restricted filesystem. Reject symlinks, parent traversal, unknown filenames and extra unreviewed files. Run the offline validator:
```sh
node publishing/jubilee-series/verify-private-handoff.mjs --help
# import { verifyJubileePrivateHandoff } from that module
# Call verifyJubileePrivateHandoff('/path/to/private/extracted/review-9')
```
3. Upload all **six** edition files separately to publisher-private R2/Drive, with scoped authorization and durable idempotency key `EJT-20261030-REVIEW9-PRIVATE-HANDOFF`. Perform private-object **readback** (not just HTTP 2xx) and SHA-256 recomputation against the manifest for each. Create private storage mapping per reviewId and revision, no public signed URL.
4. Only after a successful readback and transactional audit/outbox storage may the publisher mark each volume `private-editorial-ingested`. Persist independent per-volume receipts, actor, date, file digests, immutable revision and error code. Missing permission, transient R2 failure or mismatch leaves it **awaiting authenticated ingestion**, not published.
5. Assign separate unpublished editorial checklists:
   - Volume 1 `EJT-01-REVIEW`, 《희년과 하나님 나라의 회복》: academic footnotes **55**, source/page/11Q13 critical edition, rights and Bible translation.
   - Volume 2 `EJT-02-REVIEW`, 《우리는 다시 돌아갈 수 있는가》: nine chapters, character continuity, narrative reading and fictional-case disclosure.
   - Both: formal EPUBCheck & Ace, screenreader/devices, copyright, author final reading, private official edition approval.
6. When human evidence is complete, the **separate** authenticated workflow bridge verifies author and publisher signatures bound to the **same final EPUB SHA**. Only then create publicationId, editionId, price/ISBN under the publisher's formal policy and schedule release. Never copy an unapproved reviewId into `books/books.json` or mall feed.
7. Retain `commercialActivation=false`, `publicCatalog=false`, `checkoutEnabled=false`, `authorFinalApproval=false`, `publisherFinalApproval=false` until independent protected authorization. The bookstore/mall dual-channel gates require both readiness ACKs and canonical visibility grant. Existing commercial books stay unchanged.

## Current blockers
- User2 Desktop Commander is online but the connector reports **monthly usage limit reached**. No further remote command attempted. This is not proof of a successful or failed private publisher upload.
- Google Drive holds earlier dated Google Docs drafts, not this verified 9th revision; leave those historical originals untouched.
- Publisher R2/DB binding, receipt API and trusted upload are not provisioned or verified through this handoff; **manual or agent-approved private transport of the ZIP is still required**.
- This PR is draft. Tests only prove local package integrity/policy, not actual device, EPUBCheck, accessibility, source citations or production sales.

**Security:** The ZIP in the conversation is not encrypted. Treat it as confidential; do not put it on a public URL, public GitHub repository, unprotected drive folder or logs.
