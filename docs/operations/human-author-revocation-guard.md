# Human Author verified-entitlement write guard

Central issue #6331. This is a **private author manuscript privacy + paid-service safeguard**, not a paid-plan launch.

## Observed condition before the change

The original `human_author_interview_owner_append` row-level policy only checked owned `human_author_enrollments.writing_mode='human'`. It did not check whether the verified `writer1`/`writer3` subscription had been cancelled, expired, or suspended, and did not check if the enrollment was archived. A previously reserved project could continue to append through the direct Supabase API. Existing answers remained owner-private.

## Implemented safety contract

- `supabase/migrations/20261029010000_human_author_revocation_guard.sql` **alters only** the INSERT policy and preserves SELECT and all prior draft contents.
- A new `human` interview answer requires an enrolled **active** project, an **active** subscription belonging to the same creator and exactly matching the recorded plan, a non-null verified payment timestamp, and paid-through date strictly in the future.
- No client can mint or modify subscription entitlements. Free `simple` enrollment cannot append to paid Human Author interviews. An author can still read their own prior answers when the subscription is no longer valid.
- No automatic publishing, charging, refund, data deletion, or AI provider invocation is introduced.

## DEV-only verification performed

On Supabase development project `lxcxwbdwwojjkgybbqii`, the versioned migration `human_author_revocation_guard_20261029` was applied successfully. The transactional test in `scripts/sql/human-author-dev-revocation-rollback.sql` then passed for the following synthetic lifecycle: paid valid → append works; cancelled → 42501 denial + old answer readable; expired → denial; archived project → denial + old answer readable; renewed active paid + project → append works.

The test's final result: `DEV_HUMAN_AUTHOR_REVOKE_E2E_PASSED`, with all five synthetic user/project/subscription/enrollment/answer removal flags `true`. No real user, real payment or original manuscript was modified.

The read-only metadata query `scripts/sql/human-author-revocation-postflight.sql` returned all 4 conditions true on DEV, while before this release PROD returned `revocation_guard=false` and three other conditions true.

## Guarded production promotion

1. The orchestrator takes this PR through its official source recovery, real exact-head CI, and protected merge.
2. The existing post-merge orchestrator dispatch route `scripts/lib/human-author-release-lane.mjs` recognizes the new migration/probe and dispatches the existing protected `deploy-human-author-schema.yml`.
3. The callee requires its **exact main commit SHA**, signed and authorized EKODI task/branch receipt, full Git source ancestry and **both immutable migration blob hashes**.
4. Read-only DEV base security plus revocation policy gates must pass. PROD private base schema/security are checked before the new policy is considered.
5. PROD read-only revocation probe is used for safe idempotence. The reviewed SQL alters only the INSERT policy when absent; already-protected policies are not rewritten.
6. PROD postflight verifies revocation, private owner history reading, append-only ACL, and denial of self-minted paid entitlement. All four must be `true`. Final independent read-only production verification is required before declaring deployed.

**Never directly apply this migration to PROD via SQL editor or MCP**. Do not weaken billing checks to make acceptance pass.

## Still separate from production browser and commercial launch

Signed-in Google owner and second-person E2E across actual deployed Creator AI / auth is still required. Paid checkout integration, certified entitlements with cancellation/refund/chargeback, real AI co-writing, EPUB/ISBN/editor and author signoff, signed Bookstore+Mall product handoff and real purchases/returns have not been activated.
