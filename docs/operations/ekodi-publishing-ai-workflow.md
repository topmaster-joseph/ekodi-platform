# EKODI PUBLISH-PIPELINE-001 — AI 집필·검수·승인·예약등록·통합판매

Owner: independent EKODI Publishing. Controller: EKODI Orchestrator. Issues #6331 / #6557 / #6590.
Status: protected PR, unprovisioned workflow DB, unmerged, unlaunched.

## Data and authority boundaries
- /publishing/human/manage/ is an editorial publication-candidate workflow, not a duplicate personal writer profile or private manuscript storage.
- Existing Creator AI (author/) owns source manuscripts, conversational writing, user subscription and plan quotas. The publisher holds only author identity reference, edition/manuscript SHA-256 digests, review evidence, status, schedule and audit. Do not put manuscript text or contracts in a public repo.
- The AI queue only registers author-consented ZERO-cost requests; it does not call an AI model or report drafted text as finished. Actual work requires a signed EKODI Orchestrator connector to Creator AI, source-ownership verification and subscription/rights checks.
- Independent publisher-owned Cloudflare D1 PUBLISH_DB is mandatory. A missing binding returns 503. Never share the bookstore private DB or assume its tables and buyer credentials.
- Editor/publisher roles require backend grants. Admin cannot impersonate the author's individual approval. EKODIAN fictional manuscripts remain under #6557 and cannot be auto-imported into the general Human Publishing lane.

## Editorial workflow
planning → drafting → in_review → ready_for_author → author_approved → publisher_approved → scheduled → handoff_ready.
changes_requested leads back to drafting; any content change must invalidate former approvals and scheduling.
- Every approval is bound to the exact immutable edition SHA-256. The shared human/editorial release policy enforces rights, readability, legal and two-channel commerce QA.
- Reservation uses a future UTC date converted from Asia/Seoul. A due reservation proposes an event with deliveryState=not_dispatched; it does NOT open live sale, update a catalog, charge a buyer or send an unverified product to the mall.
- User-initiated release_receipt API is always forbidden. Future signed dual-channel dispatch must independently verify both bookstore and mall receipts on the exact edition digest before marking released.

## Protected deployment and completion requirements
1. Provision independent publisher-owned D1 and an isolated staging binding PUBLISH_DB. Apply migrations/202610291000_publishing_workflow.sql in staging first. Only after authorized backup, schema reviews and protected release should the production binding be set.
2. Grant reviewer/publisher user IDs via separate privileged audited role grant. Never derive roles from a client email, query parameter or localStorage.
3. Test authenticated create→revision→editor review→author approval→publisher QA→schedule as different identities; negative tests for missing author consent and nonowner access. Validate /publishing/api/workflow/health, 401, 403 and 503.
4. Integrate private Creator AI with its verified entitlement/author-source API. No unapproved paid AI API, billing, subscription mutation or client-provided operator tokens.
5. Attach immutable private manuscript, EPUB 3 and cover assets and confirm EPUBCheck, Ace, reading order, ISBN/납본 applicability, licenses and physical device readers. Browser-supplied QA flags and hashes are only review notes until attested against storage.
6. Build signed transactional outbox from Publishing to independent Books and EKODI Mall receivers with idempotency, product/price parity, verified buy status, safe retry/rollback and independently signed acknowledgments.
7. Protect existing Volume 1, current two bookstore catalog titles, prices, payments, purchase rights, refunds, seller contracts and open PRs; do not change any of them in this PR.
8. Complete required CI, isolated staging, owner Human Gate, protected merge, post-merge production probes and real checkout/refund tests before saying that a release is commercially operational.

## Unfinished
- D1 not provisioned; actual AI writing runner, private source connector, EPUB production, signed release dispatch, commercial booking scheduler and production UI not activated.
- Legacy /publishing/studio/ client still contains an old api.ekodi.kr/auth.ekodi.kr path and is not yet replaced.
- Up to six monthly discipline slots remain planning targets, NOT automatically published books.

## Verification
node --test test/publishing-workflow.test.mjs test/human-publishing-monthly.test.mjs
node --check publishing-workflow-api.js
node --check publishing/human/manage/app.js
node --check publishing-worker.js
