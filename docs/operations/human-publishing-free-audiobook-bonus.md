# EKODI Human Publishing — 전자책 구매자 무료 오디오북 자동 제공

Central issue #6331 · EKODI Orchestrator protected release only.

## Commercial and authorization contract

- Every completed/published EKODI ebook purchased through the first-party EKODI Bookstore carries its same-edition audiobook as a complimentary **₩0 additional-charge bonus** after voice, rights, and final file approvals. No separate audio order, subscription, payment call, or public MP3 URL.
- The existing books_entitlements buyer_user_id + book_id record is the only authoritative purchaser grant. Every audio chapter request checks a Google-verified EKODI login, current non-revoked ebook entitlement, exact approved book edition, R2 object metadata and audio approval. Older buyers receive access automatically once files are approved, without purchasing again.
- Revoked/refunded entitlements (revoked_at not null) deny both EPUB and audio. Checkout prices and financial ledger stay unchanged.
- Purchases via Upaper, Google, Amazon and EKODI Mall require a future signed, verified third-party channel purchase import or authenticated order bridge into the canonical books entitlement before we can promise cross-channel auto-grants. Never grant by email match, screenshot, bookstore listing, or unverified receipt.

## Automated production lifecycle and human gates

1. Freeze the real final author- and publisher-approved ebook edition, legal rights, manuscript text and chapter order. A new ebook edition invalidates old narration approval. Do not publish privately authored drafts.
2. Create chapter voice scripts from authorized source with explicit narration, direct speech, quotation, footnote, pauses and scene change tags. Narrator should sound naturally human; dialogue should change speaking role and emotional rhythm naturally without theatrical distortion or inventing speakers.
3. Budget-controlled synthesis: prefer local/offline speech if it passes expert listening QA. Paid high-fidelity speech synthesis requires explicit API spending approval, commercial audio license and provider consent. No unapproved voice cloning of real people or paid API invocation.
4. Produce chapter-sized MP3 files up to 32 MB each. Human listening checks: Korean/English pronunciation, biblical or academic names, natural pace, clear dialogue transitions, normalization, completeness, non-truncated chapter endings and accessible chapter labels. Preserve narrated content of final approved ebook.
5. Independent approvals are recorded in protected book catalog: author, publisher, rights, voice/performance quality, accessibility, exact ebook edition. No automatic self-approval. Only then mark audiobook status approved and publish an ordered list of MP3 track keys under BOOK-ID/audiobook/*.mp3.
6. Upload each approved final MP3 to private BOOK_FILES R2 through operator-only Bookstore library upload. Before approval uploads are flagged unapproved and cannot be downloaded; after catalog approval operators re-upload reviewed files and Worker marks R2 edition/book/approval metadata. Every track must exist for audio readiness; a partial or wrong-edition release stays closed.
7. Existing ebook purchasers see the bonus automatically in /books/library/ without extra checkout. While production/rights review is incomplete, the interface truthfully shows preparing state; it must never invent a download link.
8. On refunds/revocations, deny new audio downloads. Handle corrections by re-approving the matching final ebook edition. Audit chapter access without copying manuscript text, buyer secrets or audio bodies into logs.

## QA acceptance and restrictions

- Same purchase and same entitlement for EPUB + audio; supplementary amount exactly 0 KRW and zero extra sales ledger rows.
- Unauthenticated 401; unrelated buyer 403; revoked buyer 403; pending/unapproved/missing R2 files 409; approved matching owner and exact edition 200 with private no-store audio/mpeg, never a public audio URL.
- Document real narrator consent, commercial synthesis rights and human listening review before changing production_pending to approved. Ensure quoted dialogue is not impersonation of a real person without consent.
- Current catalog items BOOK-EKODI-000001 and BOOK-EKODI-000002 have production_pending, all approval flags false and zero approved tracks. This software change does NOT claim a mastered audiobook exists yet.
- Publishing automation must monitor production stages and QA; external voice generation costs and public release are blocked until explicitly cleared. Actual ebook purchases from other channels are not yet synchronized.
