# EKODI activity points: trusted event verification contract

Status: **development only**. Orchestrator issue #6739, draft PR #6785.

## Boundary

The browser **must never** call `ekodi_points_private.*`, write wallets or ledgers, or supply authoritative `verified_active_seconds`. The trusted backend must resolve the canonical EKODI user identity from the validated session, authorize the site membership and event, and use a privileged database connection not exposed to the browser. A browser-supplied user ID is not evidence.

## Award acceptance checklist

1. Resolve `site_id` from the server's approved site registry, not a client-supplied arbitrary value.
2. Resolve `user_id` from the verified EKODI identity mapping. **Block activation until canonical identity mapping is checked against `auth.users(id)` foreign keys**.
3. Validate the event against the original authoritative record (published comment, approved content, verified attendance, completed learning unit, etc.). Recheck ownership, timestamps, status, and revocation.
4. Derive a stable, server-generated `event_key` from event type, site, canonical user and immutable source record. Reject replay; never rely on a random key supplied by the browser.
5. For dwell time, count **foreground, user-active, server-observed** intervals only; exclude hidden/background tabs, idle periods and concurrent tab overlap. Rate-limit heartbeat ingestion. Never award from elapsed wall-clock time alone.
6. For sharing, opening the share sheet or copying a link proves **only that action**, not a completed external share. A referred visit or signup requires server-side attribution, deduplication and anti-self-referral checks. Do not reward a share completion from a browser callback alone.
7. Record an evidence reference (immutable source ID, verifier version, server verification timestamp) with a minimal non-sensitive payload; keep personal data out of the ledger metadata.
8. Invoke the private award function only after checks above. Respect its per-rule and per-site KST daily caps. Treat duplicates as idempotent no-ops.
9. Keep all sites and rules **disabled by default** until security, privacy and financial-policy review.

## Spend / transfer / donation acceptance checklist

- Validate the user's authenticated identity, redemption item and price, recipient site/campaign and consent **before** calling a private function. Do not let the browser choose an arbitrary amount or recipient.
- Define explicit anti-abuse, refund/reversal, and expiry policies. Corrections are compensating entries; never UPDATE/DELETE the audit ledger.
- Transfers require an approved directed policy, exchange rate and daily cap. A point transfer is **not** a monetary exchange.
- A point donation is **not** a cash donation or tax-deductible receipt. Any real-world cash payment requires a separate approved accounting process.
- Run the private reconciliation report and resolve discrepancies before launch and after backfills.

## Release gates

- Run all migrations on an isolated staging database, with SQL transaction and permission tests for anonymous, authenticated and service roles.
- Test duplicate requests, concurrent awards/spends/transfers, KST day rollover, zero/overflow rates, inactive sites/campaigns, insufficient balances, forged proof and cross-user access.
- Confirm both desktop/mobile screens, login return URL, user history and admin audit pages on deployed staging.
- Require protected PR checks and the EKODI Orchestrator final human release gate. Do not bypass a failed CI status-reconciliation job or treat a draft PR as deployable.
