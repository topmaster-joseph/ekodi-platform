# EKODI Jubilee — current review-9/review-10 publisher-private intake

Controller: EKODI Orchestrator. Work item #8137, parent #7666, editorial #6522.

## Current evidence (2026-11-04)

The owner-provided private Library archive dated 2026-11-02 contains **31 entries**.
Its ZIP SHA-256 is `f057c5277139eeb8e2eeaaaf4bfe35973bb606da55566ef6414ed48a66702092`;
its interior `manifest.json` SHA-256 is
`62638d4b48b4f09995877b4e871ddfa076ee21c9f2dcdd54c5d9c6f7e24699e3`.
The six current originals match the exact digests and sizes in
`publishing/jubilee-series/current-intake-20261102.json`.
The archive, manuscript bytes, login credentials, private file URLs and R2 keys
must NEVER be uploaded to GitHub or a public artifact store.

The first volume uses review-9 DOCX/PDF and accessibility-corrected EPUB;
the second volume uses review-10 editorial-candidate DOCX/PDF/EPUB.
The legacy review-9-only nine-file pipeline is NOT compatible and must remain
unchanged. Do not mark this archive `review-9` or reuse its old hash/approval.

## Safe isolated implementation

- `current-private-intake.mjs`: read manifest with an externally pinned
  SHA-256; verify all six raw source bytes **before any storage mutation**,
  require a server-authenticated publisher identity plus two trusted
  authenticated author-owned project IDs, write immutable private R2 keys and
  reread/hash every object before requesting a receipt.
- `current-private-receipt.mjs` and
  `004_private_jubilee_current_intake_receipts.sql`: publisher-private
  D1-only six-object audit transaction, idempotent exact retry, reject
  differing project links, actor, manifest or object bytes.
- `current-publisher-ingest-service.mjs`: requires
  `PUBLISHING_CURRENT_INGEST_ENABLED=true`, trusted service-caller auth,
  original publisher-side author binding, two persisted matching projects
  and publisher-configured **trusted** `PUBLISHING_CURRENT_INTAKE_INTENT`.
  The service ignores any request-supplied `expected` value.
- The service is **not connected to a browser-accessible route or the public
  `publishing-worker.js`**. Its entrypoint is internal-only.

## Strict prerequisites before any real private ingestion

1. The intended author authenticates through the official EKODI identity flow.
   The publisher validates the server-side `PUBLISHING_JUBILEE_AUTHOR_USER_ID`
   against that author's verified user ID. Never infer it from a displayed
   `admin` role or set it from browser JSON.
2. In the authenticated site, `POST /publishing/api/workflow/jubilee/register`
   must create/reuse the **two exact private workflow projects**. Reread the
   project IDs from the protected backend; prove same author and no duplicates.
3. A separate approved publisher-owned private D1 instance has migration
   `004` applied (after `001`–`003`); private R2, service authentication,
   trusted expected intent and guarded source-file transfer are fully
   configured in the protected service. Do not place production secrets in
   the ordinary source tree, test fixtures or browser.
4. Run isolated staging proof with six actual current assets, R2 readback and
   DB audit receipt, including non-owner 403, no-access 401, idempotency,
   tamper, storage outage and rollback. Repeat only after this validation in
   the official EKODI orchestration/guarded release path. The feature switch
   remains **off by default**.
5. Confirm owner-private visibility and no changes to bookstore catalog,
   checkout, sales, release dates, price or ISBN. A successful private intake
   receipt **does not** authorize publication.

## Later human publishing gates

Academic volume: verify each of the 55 original footnote claims, full source
and cited page, plus Scripture translation and illustration rights.
General volume: final literary author review and confirmation of fictional
narrative. Both: real devices/screen readers, ISBN, imprint, copyright, pricing
and same-file author/publisher signatures. Finally verify independently signed
bookstore and mall channel handoff and actual production visibility before
reporting publication complete.

**Current status:** local source hashes verified; protected code path prepared
and tested; actual verified author project IDs, publisher-private R2/D1
bindings and durable ingestion receipt are still unverified. No public sale.
