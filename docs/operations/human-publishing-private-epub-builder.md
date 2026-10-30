# EKODI Human Publishing — actual private EPUB3 draft production

Owner: EKODI Orchestrator / independent EKODI Human Publishing service; tracking #6895 and #6331.

This additive phase produces **a real EPUB3 file** offline from text supplied by an authorized editor. Unlike the existing monthly six-field calendar and EPUB preflight, it physically writes a private EPUB and verifies the result. It does **not** generate a book, prove author identity, confirm originality, validate copyright, make a public listing or sell anything. The input manuscript must already exist.

## Production boundary

- No AI API/model calls, no ChatGPT scheduled jobs, no Google Drive/browser OAuth, no Cloudflare/network access.
- No original manuscripts or resulting EPUBs are committed to GitHub, stored in Actions artifacts or copied to the public web. Paths must be absolute and stay within a private operator directory outside the repository checkout.
- A canonical slot ID must match `monthlyEditorialSlots(month)` for one of the six established independent Human Publishing fields. `EKODIAN` series is always excluded.
- The operator provides a real `YYYY-MM` slot, book/edition identifiers, dated author display name, language (`ko`/`en`) and 1–24 chapters with substantial actual source text. Missing prose, wrong slot or invalid date are blocked.
- The EPUB3 ZIP contains uncompressed first `mimetype`, safe `META-INF/container.xml`, OPF, semantic XHTML chapter content, reflowable CSS and accessible navigation. Untrusted text is XML-escaped, not treated as executable HTML.
- Output uses exclusive file creation and private permissions (0600), then the existing `inspectEpubMaster` validates ZIP integrity/CRC, OPF metadata, spine, navigation and a freshly computed SHA-256 on the actual disk file. No existing edition is overwritten.
- A returned SHA-256 is a **draft technical digest**, not a publisher- or rights-signed immutable edition. Technical preflight does not replace EPUBCheck, Ace, visual/assistive-technology review, human author/publisher approval or same-edition high-quality audiobook QA.
- The output receipt always sets `releaseReady=false`, `saleReady=false`, `authorApproved=false`, `publisherApproved=false`, `epubcheckPassed=false`, `acePassed=false`.

## Offline private use by an EKODI authorized operator

Create an outside-repository private directory, e.g. `/private/ekodi-human`, and place a non-public `manuscript.json` there with:

```json
{
  "month":"2026-10",
  "fieldId":"literature",
  "slotId":"HUMAN-202610-literature",
  "bookId":"HUMAN-BOOK-202610-A01",
  "editionId":"HUMAN-EDITION-202610-A01",
  "date":"2026-10-30",
  "language":"ko",
  "title":"작가가 작성한 실제 책 제목",
  "authorDisplay":"승인된 필명",
  "chapters":[
    {"title":"1장 제목","body":"실제로 작성한 최소 길이 이상의 원고 내용"},
    {"title":"2장 제목","body":"실제로 작성한 최소 길이 이상의 원고 내용"}
  ]
}
```

Short placeholder text will **not** pass manuscript body limits. These example words are not an actual manuscript, nor an approved book.

```sh
node scripts/build-private-human-epub.mjs \
  --private-root /private/ekodi-human \
  --source /private/ekodi-human/manuscript.json \
  --out /private/ekodi-human/draft.epub \
  --receipt /private/ekodi-human/draft-receipt.json
node scripts/verify-epub-master.mjs \
  --epub /private/ekodi-human/draft.epub \
  --expect /private/ekodi-human/edition-identity.json
```

The private input, EPUB and receipt should be retained by the authenticated EKODI Publishing service with explicit revision and rights checks, not by a browser or a ChatGPT conversation.

## Remaining operational integration

1. EKODI authenticated editorial workroom: actual author/editor roles, manuscript storage in private EKODI Drive/R2, versioned text and rights/consent evidence.
2. EKODI operator/agent sandbox: only allow a bounded native `build-private-human-epub` command with a locked, private source root and durable idempotent job lease. Do not expose CLI paths or manuscripts to public frontend.
3. Locally installed real EPUBCheck and Ace by DAISY: `scripts/verify-epub-formal-qa.mjs` with authoritative expected digest and non-synthetic validator output.
4. Human author/publisher signoff and all contracts/reader accessibility checks; immutable signed edition and audiobook pairing. Match release digest and verified storage readback.
5. Signed dual-channel Books/Mall outbox, owner gate, separate delivery receipt and payment/entitlement/refund E2E. None of these happens in this builder.
6. Official EKODI protected PR, exact SHA CI, security/governance approval, staging/production integration readback and per-job native cutover evidence before any legacy ChatGPT scheduler retirement.

This phase is an **offline native producer**, not a claim of monthly six published books or a fully autonomous bookseller.
