# EKODI Human Publishing — monthly multi-genre release line (draft contract)

Owner: independent EKODI Publishing service. Orchestration: EKODI Orchestrator. Issue: #6331.
Status: phase 0 editorial policy and public preview only. Not an operational writing agent, background scheduler, customer checkout, distribution API or production release.
Exclusion: existing EKODIAN series manuscripts, subjects, draft pipeline and author approvals remain independent. Existing bookstore sales remain untouched.

## Target cadence — six distinct releases per month
Six disciplines, each allocated **one release candidate per calendar month (Asia/Seoul)**:
1. Literature / essays
2. Humanities / psychology / relationships
3. Business / entrepreneurship / economy
4. AI / technology / education
5. Community / society / culture
6. Lifestyle / hobby / practical guides

Monthly cadence is a *capacity target*, not a license to invent books or auto-publish unchecked material. It implies up to 72 releases/year at steady state and requires multiple parallel editorial teams and review capacity. If a release gate fails, the slot stays blocked or deferred. The publishing service retains one persisted, unique (month,fieldId) slot; never silently reassign an unverified manuscript. Publication and edition IDs differ from a planning slot ID.

## Editorial pipeline (all stages logged)
1. **Topic research** (T-90 to T-60): define intended readership, reader question, problem, real-world situation, reliable sources, author identity, unique original proposition, cultural context and consent for any interview.
2. **Outline and visual storyboard** (T-60): reader journey, plot/argument, characters, internal conflict and ethical paradox, visual necessity, scene sketches and source bibliography.
3. **Drafting** (T-45): AI assists outlines, draft alternatives, style clarity, visualization suggestions and citations; author voice, originality and claims cannot be asserted merely by the model.
4. **Red-team literary review** (T-30): reject formulaic arcs, hallucinated testimony, flattened characters, fabricated cases, forced emotional uplift, stereotyping; revise factual claims and back every citation.
5. **Accessible design** (T-21): produce semantic source and reflowable EPUB 3 master, verify reading order, alt descriptions, logical figures, typography and color contrast; create separate fixed-layout companion only when the artwork cannot be expressed accessibly in reflow. Keep selectable text or a full equivalent.
6. **Real readers and rights** (T-14): target children/teen/dyslexic readers and editorial or educational experts when applicable, document the findings, resolve critical feedback; verify all art/photo licenses, likenesses and consent.
7. **Technical / legal gates** (T-7): EPUBCheck, Ace by DAISY, smartphone/tablet/desktop, keyboard, screen reader, ISBN and 납본 as applicable, book pricing/returns, edition digest. Store original/final masters outside public code.
8. **One final publisher approval** (T-3): sign the immutable digest and the print/eBook format, prices and distribution rights. Changes after approval invalidate approval.
9. **Dual-channel delivery** (target day 25): signed event via publishing-controlled transactional outbox to bookstore and mall; idempotent per (edition,digest). Both channels share one canonical edition identity and owner-issued commercial metadata but do not access each other's private databases. If either channel rejects, reconcile and hold public buy status until the edition can be fulfilled.
10. **Post-publication**: reader feedback, accessibility errata and print/POD path; corrections generate new hashes and approvals where material.

No raw AI draft, invented author, fake proof/test, unauthorized graphics, misleading ISBN or false "now on sale" entries.

## Audience and graphic specifications

### Children
- Define actual age band and reading ability, with an age-appropriate adult/child reviewer.
- Scene-by-scene storyboard, visual narrative and short text clusters; design illustrations for comprehension, not decoration. Check for stereotypes, trauma triggers and child-safety issues.
- Meaningful illustration alt text plus extended text descriptions when scene meaning cannot fit in a short alternative.
- Never encode sole reading text in a non-selectable illustration. Include a read-aloud-capable digital edition where feasible.

### Adolescents
- Realistic social and emotional context, credible agency and choices, argument complexity without condescension.
- Timelines, relationship maps, explanatory diagrams and reflective prompts **only** when useful to the text; avoid overwhelming visual noise.
- Youth reader panels and age-sensitive subject review; plain explanations of unfamiliar terms.

### Dyslexia-friendly (reader selectable, never one mandatory font)
- Reflowable text, font override, adjustable font-size, line and paragraph spacing, left alignment option and comfortable text measure. Avoid forced justification and words baked into images.
- High-enough contrast with user color preference where feasible; speech and screen-reader compatibility, focus indicators and logical navigation.
- User testing with dyslexic readers. Do not claim a specific font cures dyslexia or that any one setting works for all readers.
- If producing graphic fixed-layout picture books, provide accessible reading alternative and verify content on mobile/screen reader.

### Default for ALL editions
Semantic heading hierarchy, nav document, image alt text/extended description, correct language metadata, reading order and ARIA only when necessary; accessibility metadata (accessMode, accessibilityFeature, accessibilityHazard, accessibilitySummary). Use EPUBCheck and Ace plus manual assistive-technology tests. Target W3C EPUB Accessibility 1.1 with WCAG 2.2 AA where practical.

Sources: https://www.w3.org/TR/epub-a11y/ , https://www.w3.org/TR/epub-fxl-a11y/ , https://www.w3.org/TR/WCAG22/ , https://www.bdadyslexia.org.uk/advice/children/how-can-i-support-my-child/style-guide

## Phases and responsibilities
- **Phase 0** (this PR): published source editorial policy, one-per-field planning slots, fail-closed quality evaluator, immutable release digest contract, tests and public editorial preview; no transactional APIs.
- **Phase 1**: service-side persisted production plans with owner auth, signed job/approval/outbox, actual generation/editing pipeline, storage and EPUB QA integrations; segregated adult/child/teen reviewers; release status and audit.
- **Phase 2**: bookstore and mall consumer adapters for signed events, order/entitlement/settlement integration, anti-double-charge, rollback and reconciliation; stage payment tests and protected deploy.
- **Phase 3**: POD print masters, proof approvals, supplier contracts, orders, shipping/returns, accessibility-adapted print editions.
- **Phase 4**: analytics, retailer outreach, Growth OS, revenue-verified automation.

Do not enable public buy buttons or publish events until all legal, commercial and production gates pass. One release approval can permit later automatic *delivery* of an immutable approved edition; new content still needs separate approval.

## Required acceptance tests
- 6 unique deterministic slots per month, duplicate rejection and rollover deferral.
- Rights, literary craft, factual claim, accessibility, reader profile, print proof and digest mismatch block release.
- No EKODIAN content/series enters the new writing queue.
- Approved event has one idempotency key and two channel targets but **no direct side-effect**; dispatcher signs, persists, verifies acknowledgment and reconciles.
- Staging proves both channels display identical approved edition/price; live payment off until verified, refund revokes entitlements, unauthorized downloads denied.
