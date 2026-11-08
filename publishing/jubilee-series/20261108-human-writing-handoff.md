# 2026-11-08 희년신학 시리즈 저자 선택 정본 / 휴먼집필 인계

- Task: `jubilee-human-manuscript-baseline-20261108`
- Source authority: author explicitly selected the two newly attached PDF manuscripts as **the new editorial baselines**, replacing the prior November review-9/review-10 baselines **for future writing**.
- Official metadata: `draft-registry.json` → `author-selected-baseline-20261108.json`.
- Previous package: `current-intake-20261102.json`; retain immutable hashes and all existing receipts. Never delete or modify its original six files as a side effect.

## Book 1 — 희년과 하나님 나라의 회복

- Author: 정찬균. New source: 2026-10 revised scholarly PDF, 21 pages, sha256 `e2a1ee508f1285d8a70de42114dcc50f6ea5d827ae18f84ded0ce83114a1bd59`.
- Continued AI-assisted, human-review manuscript candidate: 56-page A5 draft. Eight new hermeneutic/argument sections cover: interpretation stages, distinct legal release systems, Second Temple/Qumran genre limits, Luke 4 and aphesis, Acts communal voluntariness, trauma-sensitive restorative ethics, diaspora and accountable applications, and limitations/future study.
- The source's unresolved `원각주 대조` markers and original editorial correction note remain visible to editors. This draft is not a verified scholarly final edition; no invented citation/page number is accepted.

## Book 2 — 우리는 다시 돌아갈 수 있는가

- Author: 정찬균. New source: 2026-10 popular theology PDF first draft, 14 pages, sha256 `3620b7aade0c689e44824c635bffca2c2aebeea1243197f0b094ccd76f31563e`.
- Continued AI-assisted, human-review manuscript candidate: 40-page A5 draft. Existing 9 chapters and prologue/epilogue are retained. Ten connected original scenes follow fictional people navigating a closed small business, debt consultation, a multilingual faith community, consent, dignity and rest. These are fictional; not interview testimony.
- Final author literary reading, copyright, long scriptural quotation permissions, and digital accessibility approval are outstanding.

## Separation of authority and follow-up

1. **Editorial baseline selection (this task):** metadata-only user-selected replacement; nothing is removed, sold, or deployed as manuscript bytes.
2. **AI-assisted writing drafts:** private DOCX/PDF source files and hashes exist in the authorized conversation workspace. Only hashes and metadata belong in public GitHub; do not upload manuscript source or private URLs to public repository, issues or CI artifacts.
3. **Publishing source ingest:** require an independently protected publisher-only service identity, approved R2 + isolated D1 bindings, authorized transport of the two source PDFs and two revision drafts, per-file SHA-256, private R2 object readback and durable D1 receipt. Update the two existing *private* project records in a transaction; verify original author ownership and never create duplicate titles.
4. **Author and publisher gates:** preserve `authorFinalApproval=false`, `publisherFinalApproval=false`, `publicCatalog=false`, `commercialActivation=false`, and all sale flags disabled. Do not imply selecting an editorial source is a signed release.

## Verification

- Original source PDF SHA-256 and byte sizes checked against the attached files.
- Each continued DOCX was rendered to PDF with 56 / 40 page readbacks; line flow, headings, footers and sampled glyphs checked.
- Original body paragraphs were checked against the reconstructed DOCX (no unmatched original body blocks); new content is distinguishable as editorial additions.
- Automated repository test: `node --test test/jubilee-author-selected-editorial-baseline.test.mjs`.

This record does not assert successful Cloudflare R2 storage, D1 manuscript digest update, or actual 3-account author readback. The 2026-11-05 protected resource bootstrap workflow was prepared but no successful provision or subsequent ingestion receipt is evidenced here.
