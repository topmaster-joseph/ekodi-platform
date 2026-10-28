# EKODI Human Author — DEV-only private author RLS E2E

Issue: [#6331](https://github.com/topmaster-joseph/ekodi-platform/issues/6331)

## Scope

The versioned production private author schema has been applied via the protected workflow. The actual `/author/human-writer.js` page is served, but a Google-signed-in browser end-to-end test is a **different acceptance requirement**.

This fixture checks the PostgreSQL authorization logic directly with two **synthetic developer identities** and never authenticates against a real member account. Do not call it a live browser E2E or a paid-checkout test.

## Reproducible development test

SQL file: `scripts/sql/human-author-dev-rls-e2e-rollback.sql`.

Run **only** against the approved `ekodi-platform-dev` project (`lxcxwbdwwojjkgybbqii`), with authorized DB test privileges. It must NEVER run against production, staging pointing at production, or a customer-owned database.

- Starts a database transaction.
- Inserts two fictitious `auth.users` records with `example.invalid` email addresses and their own six `author_projects`.
- Inserts a `pending` writer1 subscription and a **synthetic active** writer3 subscription inside that transaction. No payment processor, real entitlement, or checkout is touched.
- Switches the PostgreSQL role to `authenticated` and replaces request JWT claims for each fictitious actor, then exercises the actual guarded `human_author_reserve_project` RPC and row-level policies.
- Checks free first project; idempotent retries; free monthly quota rejection; unverified paid-mode denial; writer3 three projects but not four; rejection of foreign projects.
- Appends and reads the paid test author's private interview; blocks writing interview answers into the free simple enrollment; verifies the other author cannot read subscriptions, enrollments, or private answers and cannot insert a new answer into a known foreign enrollment UUID.
- Resets the role, **ROLLBACKS** all inserts, then checks that all five classes of synthetic records were removed.

The final result is `DEV_ROLLBACK_HUMAN_AUTHOR_RLS_E2E_PASSED` with all five `*_removed` flags set to true. An error in an assertion aborts the test transaction; do not use the test against real users.

Static regression: `node --test test/human-author-dev-rls-fixture.test.mjs`, plus the existing protected PR CI.

## Remaining production acceptance

An authorized, disposable real Google test identity must independently demonstrate project creation, login-return URL, answer creation/reload, append-only revision, and a second distinct identity unable to access it. That browser test needs a non-admin owner and a different non-admin reader and must delete only its own disposable records.

Paid provider API, verified recurring subscription, cancellation/refund/chargeback, 8-stage author AI co-writing, editorial consent, EPUB/graphics/ISBN, signed dual-channel handoff, customer checkout/download/returns are **not** tested or activated by this SQL fixture. Paid enrollment and publishing remain disabled until their own acceptance evidence exists.
