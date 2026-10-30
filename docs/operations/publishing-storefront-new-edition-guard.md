# EKODI Publishing: Bookstore + Mall new-edition release boundary

**EKODI Orchestrator controller.** Parent publishing issue #6331, private completed book/schedule code Draft PR #6638. This isolated follow-up PR is intentionally based on the current `main` rather than an old branch, so recent Bookstore payment + audiobook code is preserved.

## Compatibility and security

- **Preexisting Bookstore titles only**: `BOOK-EKODI-000001` 《에코디언을 찾아서》 and `BOOK-EKODI-000002` 《AI 시대의 진보와 빈곤》 retain current direct-sale behavior and Mall mirrored listing. Both ID and known title/author must match.
- **New titles**: an extra entry in `books/books.json`, or client supplied `directSale.enabled`, `published`, `approved`, or public pricing, is NOT an authorization to expose/sell. The buyer-facing quote, order, payment confirmation, ebook and bonus audiobook download on Books are guarded. Before calling the payment provider to charge a pending order, the server checks release again.
- **Trusted proof**: new `publisherRelease` pointer contains `publicationId`, `editionId`, `releaseDigest`, but it is only an identity, not proof. The server must have `env.PUBLISHING_RELEASE_GATE.verifyPublicRelease({...pointer,channel:'books'})` as an authenticated internal service binding; the returned object must exactly match book/edition/digest/channel plus `authorized=true`, `state='released'`, `visibility='public'`, `checkoutEnabled=true`. On missing binding, mismatch, exception or revoked status: **deny**.
- **Mall static mirror**: static `bookstoreProducts` only reflects the two known preexisting books to prevent accidental publication through JSON. `approvedBookstoreProducts(catalog,publisherBinding)` is a future *server-only* projection for approved new editions after the publisher's actual binding is provisioned. It is NOT wired into production Mall at this stage, so no new book can enter the Mall automatically yet. Do not trust browser-injected binding functions or use public unsigned `approved` data to render sale buttons.
- **Publisher private pipeline**: PR #6638 maintains editorial review, private finished-edition registration, signed approvals, schedule, two-channel preparation and joint public release; it is **draft** and not deployed. This code does NOT enable its database, cron, publisher binding, Mall authenticated mirror ingestion or actual content delivery.

## Protected rollout remains blocked

1. Verify publisher-owned private R2/D1, real user roles and signatures, release digest and private outbox in isolated staging.
2. Deploy authenticated `PUBLISHING_RELEASE_GATE` service binding to Books, and publisher-authenticated Mall feed ingestion. Both stores MUST block unapproved search/listing/price/checkout/downloads for new books; plan how preexisting titles are preserved.
3. Use two real signed acknowledgements and central release grant to activate both stores, then invalidate listing caches, test checkout/refunds and entitlements.
4. Fully validate book rights (including Bible translations), official EPUBCheck, price/ISBN/contract rules, author and publisher Human Gate and protections.
5. Review owner merge and CI on the **exact head SHA**, deploy through official protected path, smoke-test public page and receipt. No deployment or payments should happen merely because this PR was created.

**Jubilee Theology:** review-8 volumes EJT-01-REVIEW and EJT-02-REVIEW remain *private editorial review*, not enrolled in Books catalogue and not entitled to a public price or sale date.


## Generic Books admin public-state bypass guard

- `books-control.js` now invokes `genericAdminPublicMutationAllowed` before both `POST /api/books/admin/publications` and `PUT /api/books/admin/publications/:id`. A newly created book must start **private**, even if an admin POST supplies `isPublic:true`; a private record cannot be promoted by merely setting `isPublic:true`.
- Currently public Books D1 rows remain maintainable *when the existing edition's immutable commercial metadata is unchanged*. For published records, price/ISBN/cover/title/author/edition/status/stage/format/sales links/distribution cannot be swapped in this generic endpoint without a separate approved publisher release workflow. Unpublishing remains allowed; republishing requires that workflow.
- Unlike a consumer-side listing gate, this is a **write-protection rule**. It does not retroactively prove all historical `books_publications.is_public=1` records are safe, nor does it replace the protected, versioned publisher publication process. A future authorized publisher-only ingestion service must perform public promotions after verified dual-channel final approval, rather than reusing the generic admin flag.
- `test/books-publication-transition.test.mjs` covers unauthorized new publish, metadata swap, old public unchanged, malformed JSON, unpublish and forbidden re-publish. Publishing Storefront Release Gate CI executes this test.
