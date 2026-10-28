# Human Publishing — author plans and guided co-writing

Status: proposal / preview only. Billing, renewal, AI writing execution, production ISBN and sale are disabled pending separate implementation and operational checks.
Owner: independent EKODI Publishing. Command: EKODI Orchestrator. Related issue #6331, PR #6339.
Excluded: EKODIAN series content and manuscript pipeline.

## Role and plan separation
- **Publisher editorial author**: verified chief administrator AND publishing-editor scope from trusted server authorization. Owns the six categories' monthly editorial automation. An ordinary paid plan never grants this role.
- **Free personal author**: existing EKODI universal FREE member; simple AI outline/editing for one active personal project, a proposed max 5000 characters for free draft. Private save/export. No promise of publishing quality, distribution or sale.
- **Paid Human 1**: 100,000 KRW/month, one new deep conversational writing project in a billing cycle; author responds to structured questions and approves every chapter.
- **Paid Human 3**: 150,000 KRW/month, up to three new projects, same intensive editorial workflow.

'One or three books per month' means new STARTED projects, not completed or guaranteed titles; failed publication tests defer release. Project credits must be counted and reserved server-side, with one unique person/month/request-key lock and idempotency. A member cannot bypass limits through browser storage or a fabricated client role.

VAT inclusion, billing cycle anchor, cancellation and refund method, unused quota rollover, page length, model usage budget, reader panels, external editing and cover design costs, ISBN/publication fees must be explicitly decided and incorporated into approved subscriber terms BEFORE enabling subscriptions. Do not enable paid API routing or real charges without limits and verified MID/account.

## Deep human co-writing: eight states
1. Why author writes; for whom; core question.
2. Real-life moment, lived observation, original documents; distinguish invented fictional scenes from testimony.
3. Conflict, moral paradox, opposing arguments, motivations and credible complexity.
4. Reader profiles: children's ages, teen needs, dyslexic reading/graphic preferences.
5. Table of contents, scene-by-scene visual plan, chart and graphic necessity.
6. Chapter interviews; author source notes; multiple draft alternatives, AI discussion and revision.
7. Skeptical literary and factual review; detect fabricated quotes, forced sentiment, bias, logical inconsistencies, unlicensed illustrations.
8. Author's digest-bound approval and publisher's independent final rights/accessibility/production/commercial approval.

Archive author's actual response, suggested text, accepted and rejected alternatives, references, revisions, private manuscript digest and reviewer evidence in the existing person-scoped Creator AI system. Never invent testimony, reading tests, quotation sources or endorsements.

## Graphic / reading accessibility
Children: visual storyboarding, age-defined sections and page rhythm, short paragraph groups, a real child/adult reading review, clear alt text of illustrations and selectable text or accessible equivalents.
Teens: emotionally credible characters, age-sensitive subject checks, relationship maps and timelines only where useful; teen reader testing.
Dyslexic readers: choose font size/family, text/line spacing, page tone, left alignment, reflow EPUB, TTS and screen reader compatibility. No claim any font cures dyslexia. Reader testing required.
W3C EPUB Accessibility 1.1, EPUBCheck, Ace by DAISY, actual screen reader and keyboard tests. https://www.w3.org/TR/epub-a11y/ ; https://cdn.bdadyslexia.org.uk/uploads/documents/Advice/style-guide/BDA-Style-Guide-2023.pdf

## Product ownership and distribution
- Reuse existing Creator AI writer projects and universal membership service; do not create duplicate person identity, billing or author databases.
- Writing projects start private. The author controls original authored contributions; publishing and distribution licenses, third-party content and AI assistance disclosure must be documented and agreed.
- Free projects do not retroactively consume paid quota; subscribers retain lawful access to manuscripts/exports after cancellation as defined clearly in storage terms.
- A paid plan grants guided writing service, NOT an automatic legal right to publish and not permission to access other authors' books.
- Only signed publisher-approved immutable editions can be delivered through an outbox to Books and Mall; separate sales origin, order, entitlement, royalty and refunds from author subscription payments.
- Existing EKODIAN books, bookstore external links and user purchase entitlements must be preserved.

## Phased integration
P0: proposed plan and role policy, quota checker, guided dialogue stage machine, public information screen, deterministic tests (this PR).
P1: authenticated private author studio with verified account/plan, RLS and actual multi-turn AI/original manuscript persistence.
P2: recurring subscription terms, customer consent, server billing, cancellation/refunds and protected live payment acceptance.
P3: signed bookstore/mall sync, ISBN/price validation, direct purchase, paid entitlement, download, cancellation/refund and ledger reconciliation.
P4: accessible children/teen/dyslexic specialized reviewers, optional voice and POD/print, growth and monitoring.
Never report operational completion from this P0 document or code alone.
