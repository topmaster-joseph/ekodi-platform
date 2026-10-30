# EKODI 출판 — 모든 저자를 위한 집필 멘토 P1 (2026-10-29)

Owner: EKODI Orchestrator · Central issue: #6331.  
Public intended entry: `https://ekodi.kr/author/` (canonical path).  
Publisher: `https://ekodi.kr/publishing/`; `https://ekodi.kr/publishing/human/` remains the deep Human service.  
This implementation adds a working private guided writing UI to the existing Creator AI writer project — not another identity, billing, customer record, or publication service.

## Functional behavior

1. Verified EKODI account creates/opens an existing `writer` project, then clicks **무료 분야별 집필 멘토**.
2. Both FREE and paid users (and a valid chief admin writing as an author) receive the same baseline interactive coach; there is no paid entitlement check, network AI invocation, token usage, provider credential, or checkout.
3. The user selects one of seventeen disciplines and follows eight stages: inspiration, reader, unique perspective, outline, draft, critique, revision and final author reflection. A discipline-specific expert lens adds a relevant critical principle; the guidance never pretends to be an accredited human editor or a generated complete manuscript.
4. Responses remain in in-memory state, controlled by the authenticated project owner. No upload, analytics payload, localStorage or external service; closing prompts for confirmation if unsaved. The writer explicitly downloads a Markdown personal archive and may copy ideas into the existing Creator AI chapter editor for durable, access-controlled server saving.
5. No free-tier ISBN, sale request, webshop listing, royalty agreement, voice synthesis or paid publishing is implied or activated. The bookstore button is only a reader navigation link; it no longer logs a misleading `books.handoff.requested` sale-like event.
6. Deep paid writing continues through `author/human-writer.js` and server-verifiable subscriptions; chief-only planned editorial authority and signed publishing releases remain on the separate publisher-owned lane.

## Privacy, safety and accessibility

- Do not use customer-entered text in HTML templates; create DOM elements and assign `textContent` or `value`.
- The user must be logged in, own the specific project, and have writer mode before a modal opens.
- All free editor features avoid third-party AI/model calls; possible high-risk claims are guided toward external evidence and genuine expert review rather than fabricated credentials.
- The dialog is keyboard-usable with tab containment, Escape and close button, textarea labels, field selector, visible status messages and a destructive-close confirmation.
- **Free author copyright remains with the author.** This helper does not grant EKODI rights or trigger publication.
- Publishing and sale are separately gated by `publishing/human/author-plans.js` and `publishing/human/editorial-policy.js`, with edition-bound contracts, audio bundle evidence, and Human Gate.

## Test/rollout

- Node unit regression: `node --test test/author-inspiration-mentor.test.mjs`
- Existing source validator: `node scripts/validate-author.mjs`
- Full CI + EKODI Orchestrator provenance, stage and guarded production `deploy-author.yml` after merge.
- Operational proof: load `/author/`, log in as a verified non-paid writer, open personal project -> coach -> switch fields -> write -> download; check no payment requests or unauthorized public listing; repeat with paid writer. Confirm `/publishing/human/` describes paid-only deep writing and `/books/` is public discovery only. Production is **not complete** without this proof.
- The feature's `/author/` path uses canonical apex route; legacy author Worker config may still list the underlying source host as infrastructure, but no user-facing subdomain URLs are intentionally introduced.

No actual high-quality audio generation, royalties, marketplace synchronization, live checkout, or production runtime verification is claimed by this P1 UI.
