# Homepage subscription inbound sales automation

Owner intent: #10374, parent #9836. Canonical current surfaces are `/homepage` and `/homepage/admin`; the EKODIBIZ business overview remains unchanged.

This bounded release reuses the existing subscription request record and owner-contact delivery. It introduces no CRM database, administrator menu, prospect collection, message scheduler, autonomous customer outreach, payment or revenue recognition.

- On selection, applicants immediately see a six-audience proposal using the canonical subscription estimator and current VAT-inclusive prices. The receipt preserves that proposal.
- The contact endpoint recomputes the proposal from the canonical server price policy, ignoring submitted monetary totals, then appends it and the first-response / 3-day / 7-day worklist to the existing fixed-owner notification. It does not email the applicant.
- Existing authorized `/homepage/admin` rows derive proposal and follow-up drafts plus a next-business-day 18:00 Asia/Seoul first-response target. Pending records sort ahead of published/cancelled records. `영업 대기` filters the pending queue. Copying is an explicit operator action.
- Admin list currently omits original options. Its derived proposal therefore explicitly shows base-plan pricing and asks the operator to verify additions/discounts in the original intake. Browser monetary estimates are not verified prices, contracts or revenue.
- Task timing is derived from intake, not actual contact history. The UI explicitly marks contact status unverified. Published/cancelled records get no sales-followup tasks. No claim of sent follow-ups or durable contact-completion tracking is made.
- If the durable intake succeeds but the separate notification fails, the form displays the stored receipt and notification delay instead of inviting a duplicate application.

Verification: deterministic audience/pricing/time/replay/closed-state tests; isolated mail-adapter test verifies exactly one fixed-owner message and zero customer messages; ordinary contact/honeypot regression; escaped text rendering and inline script compilation; actual esbuild keepNames serialization smoke. Full repository tests and protected release still run in official CI. Never submit a real inquiry or charge in production verification.

Rollback: revert the helper, page and contact changes through the guarded source path. Existing records and schema remain untouched. Remaining commercial operations such as verified customer delivery, completed-contact audit, checkout/settlement and revenue analytics remain owned by the existing follow-on Sales OS work (#9836), not fabricated by this release.
