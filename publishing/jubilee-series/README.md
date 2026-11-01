# EKODI Jubilee Theology Series — protected editorial registration

**Controller:** EKODI Orchestrator. **Parent publishing issue:** #6331; **series issue:** #6522.
**Current phase:** two private editorial draft records only. Not released, listed, paid for, or stored in the public catalogue.

This directory deliberately contains **no manuscript text, copyrighted files, Google Drive private URLs, personal contracts, author authentication identifiers, prices, ISBNs, customer data, cover assets or real approval signatures**. It records the known 8th-revision editorial status only. The source Word/EPUB/PDF review files remain outside this code repository until private controlled storage is provisioned and verified.

## Two independent books

| Review ID | Work | Genre | Status |
|---|---|---|---|
| EJT-01-REVIEW | 희년과 하나님 나라의 회복 | Academic theology | Citations, original source and rights review pending |
| EJT-02-REVIEW | 우리는 다시 돌아갈 수 있는가 | General theology | Final literary reading and rights review pending |

These are **NOT** the EKODIAN novel series and do **NOT** occupy a monthly Human Publishing discipline slot. The `humanities` field identifier is compatibility with the existing read-only editorial readiness evaluator; the series-specific `genre` distinguishes academic vs popular theology. A real publishing backend must add theological subject support and assign official publication/edition IDs before promotion. No catalogue ID is reserved or claimed.

## Actual privacy and commercialization boundary

- `publishing/jubilee-series/draft-registry.json` is metadata-only. `publicCatalog:false` and `commercialActivation:false` are **editorial declarations, not server authorization**.
- The public `books/books.json` is not edited by this proposal. Existing books and purchases are untouched.
- No commerce endpoint, payment setting, public URL, listing, entitlement, database migration, or deployment configuration changes are made here.
- `review-gate.js` enforces structural draft isolation, then independently requires **both author and publisher digest-matched approvals**, an independently verified asset digest, and the existing `evaluateReleaseReadiness` policy.
- A **trusted publisher backend** must authenticate the author, verify cryptographic approvals, log an immutable edition digest, run EPUBCheck/Ace/device tests, verify copyright/translation rights, assign verified ISBN if applicable, determine price/returns, then dispatch a signed idempotent event. Passing a client-provided `serverVerified` object is **never authentication**. The module itself performs zero side effects.
- The code paths currently include older subdomain deployment declarations. The target **user-facing** locations per EKODI policy are `https://ekodi.kr/publishing`, `https://ekodi.kr/books`, and `https://ekodi.kr/ekodimall`. Legacy Worker routing requires a separate reviewed migration; this PR does not falsely claim it has happened.

## Before any sale or author approval

1. Verify each of the 55 first-volume footnotes against the actual cited source and page; preserve legal/copyright distinctions.
2. Secure and audit the publisher-controlled master artifact, run formal W3C EPUBCheck and Ace by DAISY and actual reader/screen reader tests.
3. Confirm Bible-translation quotation rights, all third-party rights and licensing, cover ownership, accurate bibliographic metadata, and bookstore customer/refund terms.
4. Obtain genuine author final approval and publisher approval **bound to the same immutable edition digest**; changing the file invalidates both.
5. Only then promote through EKODI's protected release, independent publishing service, and signed dual-channel handoff. Until then, return no public buy URL and keep all payment paths disabled for these books.

## Testing

```sh
node --test test/jubilee-series-review-gate.test.mjs
```

This deterministic test **does not** exercise real storage, auth, payment, publication or deployment. It proves only that the new metadata state is isolated and unapproved releases fail closed. It is intentionally narrower than live end-to-end acceptance.
