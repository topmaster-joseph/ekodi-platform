# EKODI Pay · merchant status + immutable workspace binding (nonfinancial)

> **Source-only change.** No public API is deployed, no PG call or money movement
> is permitted, and reference-only SQL is not applied to production D1.
> `/ekodipay/` and the read-only payment demo remain unchanged.

## Why a second authorization check is mandatory
Authentication to EKODI establishes a person, not authority over a merchant.
The canonical authorization identity is an **immutable workspace_id**, not the
customer domain, site slug, browser URL, login email, or a role label. One legal
entity may have multiple sites; sharing a PG merchant between sites must be an
explicit documented binding, not an inferred default.

## Contract for the eventual private endpoint

`GET /ekodipay/private/merchants/{merchant_id}/status`

This is **not currently routed**. Only an already authenticated first-party
server may mount the exported handler, and it must provide **all** of:

1. `db`: protected, server-held D1 connection with migrations applied using the
   independent guarded finance release plan. It must not be a generic public DB.
2. `authenticate(request)`: server-verified active EKODI session, returning a
   trusted principal shaped as `{id,kind:'user',authorityScope:'tenant',
   subject:{type:'tenant',key:'...'}}`. Do not use raw request body/headers, an
   `approved:true` claim, a browser-submitted role, or an unchecked Google email.
3. `resolveWorkspaceId({principal,request})`: read the immutable workspace ID
   from an active, server-verified tenant membership. Ignore browser-provided
   workspace IDs and slugs as authority. Platform administrators must explicitly
   enter and receive the appropriate **tenant** membership, never inherit it.
4. `authorize({principal,workspaceId,merchantId,capability})`: independently
   verify the user's tenant-scoped `ekodipay.merchant.status.read` permission.
   It must return the literal boolean `true` and honor explicit denies.
5. D1 must additionally find an `active`, documented merchant/workspace binding
   for the same `merchantId` AND `workspaceId`. Any disagreement returns 404
   to avoid leaking other merchants' existence.

Responses are only status flags: no real merchant MID, account number,
last-four bank digits, financial HMACs, legal identity reference, credential
binding, approval proof, reviewer identity, order, buyer data, or raw SQL rows.
Every result is `private, no-store`; no mutations are supported; `canCharge`
is **always false**. A status lookup must never make a merchant live-ready.

## Database / revocation

The source-only `0003-merchant-workspace-binding.sql` table
`ekodipay_merchant_workspace_bindings` depends on PR #5039's
`ekodipay_merchants` table. It is **not safe to apply before the upstream
migration** and verified ownership evidence.

- An `active` binding requires independent proof, verifier and timestamp.
- Identity, proof, and verified reviewer are immutable after insertion.
- Deletion and reactivation of a revoked binding are blocked in SQL.
- Finance/tenant owners must complete separate authenticated enrollment and
  revocation workflows; do not give INSERT/UPDATE authority to this status API.
- Changing financial ownership or a workspace relationship requires a new
  audited onboarding workflow and separate human financial/tenant approval.
- A successful SQL test is **not** proof of PG MID ownership, bank deposits, or
  any regulatory registration.

## Local verification

```sh
node --test test/ekodipay-merchant-status-reader.test.mjs test/ekodipay-workspace-binding-sql.test.mjs
```

Use production proof only after verified DB migration, owned server integration,
privacy/log audits, role/tenant denial tests and protected deploy with automatic
rollback. Actual payment functionality further requires PG contract/MID,
server-side signed order issuer, matched encrypted test/live keys, confirmed
refund and settlement policies, PC/mobile sandbox results, and an independent
exact-SHA financial Human Gate.
