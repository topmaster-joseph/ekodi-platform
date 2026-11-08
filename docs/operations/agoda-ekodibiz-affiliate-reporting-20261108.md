# Agoda direct affiliate reporting — EKODIBIZ / EKODI Mall

As of 2026-11-08 KST. EKODI Orchestrator work item: https://github.com/topmaster-joseph/ekodi-platform/issues/8918.

## Authoritative scope

- Business/commission owner: EKODIBIZ. EKODI provides the referral page and protected release capability only.
- Public source: `https://ekodi.kr/ekodimall/travel/stay/`.
- Partner Center-generated base link: `https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1980072&hl=ko-kr`.
- Partner Center text-link documentation explicitly supports custom `&tag={tag1}_{tag2}_{tag3}` and reports can show booking tags:
  https://agodapartners.zohodesk.com/portal/en/kb/articles/text-link-1-3-2019
- Stable, anonymous, 3-component tag: `ekodi_mall_stay` (channel / placement only, never a visitor ID).
- Compiled link: `https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1980072&hl=ko-kr&tag=ekodi_mall_stay`.
- Browser-observed external partnersearch redirect preserves `cid=1980072` and `tag=ekodi_mall_stay`; this is a redirect validation, **not** a completed booking or credited payout.

## Partner Center owner checklist (external account; human-gated)

1. Under Profile / Sites confirm that `ekodi.kr` is the registered site identity for CID `1980072` and is active; a working CID URL is not definitive proof of site-domain registration.
2. Under Profile / Bank Information verify that the beneficiary is the intended EKODIBIZ contracting entity and the bank verification/transfer state is valid. Do not copy account numbers, legal identifiers or bank screenshots into GitHub.
3. Under Reports choose Booking Date for bookings, Departure Date for departed stays and Payment Date for estimated commission due. The report provides a date range, Generate and Export. Filter or reconcile `ekodi_mall_stay` when present. Zero bookings is a real zero only if an official report for that range returned zero; an unavailable report is **unknown**, not zero.
4. The daily report can take up to 24 hours to reflect bookings. Never place a real test booking without the official test arrangement. No direct Agoda API/feed permissions or verified per-hotel inventory have been granted by having a text link.
5. Agoda public commission guidance currently says the payout threshold is USD 200 and bank transfer requires correct bank information. Payment date differs for Pay at Agoda and Pay at Hotel; follow the linked official help for the contract's effective terms:
  https://agodapartners.zohodesk.com/portal/en/kb/articles/reports
  https://agodapartners.zohodesk.com/portal/en/kb/articles/commissions

## EKODI reporting evidence boundaries

- Marketing referral clicks measured first-party are different from Agoda-recognized clicks; do not combine or equate them without attribution evidence.
- Actual Agoda reported bookings/departures/commission should be imported only through an approved, permissioned account reporting workflow and recorded by source+date+tag with idempotency and immutable evidence references. Do not scrape a logged-in consumer browser for CSVs or retain session cookies.
- Neither estimated commission nor partner-reported commission is booked cash revenue; confirmed settled money requires reconciliation with an actual transfer.
- Never activate the existing central candidate `agoda-network-linkprice` merely because the direct program's CID works. They are distinct programs.
- The public page must continue to show zero validated hotel cards until hotel inventory and catalog rights have been verified.
- All release changes must pass EKODI AI Orchestration, source checks, staging, guarded production and real-host validation.

## Rollback and validation

Revert this controlled Mall change to restore the previously verified untagged partner link. A missing or malformed `campaignTag` intentionally suppresses the new CTA rather than making an untracked redirect. Never modify the owner-generated base CID, add visitor identifiers to a tag, or change tracking IDs from an unauthenticated source. A malformed tag fails closed.
