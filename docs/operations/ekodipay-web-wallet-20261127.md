# EKODI Pay web wallet release candidate — 2026-11-27

Task: ekodipay-web-wallet-settlement-20261127. Intent: #10451.

## Product and current release scope

The existing canonical root is **https://ekodi.kr/ekodipay/**. Preserve it; do not
create a competing /pay service, subdomain, new login system or duplicate checkout.

New mobile/desktop routes:

| Route | Behaviour |
| --- | --- |
| /ekodipay/wallet | Own-card list and provider-hosted registration/settings |
| /ekodipay/send | Request payment for a previously authorized service-owned order |
| /ekodipay/request#opaque-token | Cardholder reviews and explicitly opens their own source checkout |
| /ekodipay/seller | Authorized workspace report, signed corrections, scheduled vs actual payouts, CSV |
| /ekodipay/api/web/status | Configuration readiness, never a financial success receipt |

This release ships the UI and fail-closed backend implementation. **Production
card enrollment, source-order adapters, D1 binding/schema application and real
settlement ingestion have NOT been verified or activated by this change.**
New flags remain false in wrangler.ekodipay.toml. No migration, PG contract, key
change, payment, payout or independent seller collection is performed.

## Card registration

Use a **separately approved Brandpay MID/key pair**, never infer Brandpay approval
from an existing ordinary Toss checkout key or historic card receipt.

- EKODIPAY_WEB_ENABLED=true plus a migrated EKODIPAY_WEB_DB binding.
- EKODIPAY_BRANDPAY_APPROVED=true, EKODIPAY_BRANDPAY_MID and the dedicated
  EKODIPAY_BRANDPAY_CLIENT_KEY / EKODIPAY_BRANDPAY_SECRET_KEY.
- Secret belongs in the approved server secret store only.
- Bootstrap POST verifies canonical Supabase identity with the existing
  ekodi-principal.js helper. Identity is never taken from browser email/role/id.
- Generate a random customerKey per person **and MID**.
- Registration uses the provider SDK. No card number, CVC, PIN or reusable
  provider token is collected by EKODI UI or stored in the new schema.
- The SDK callback performs a same-origin GET using a 10-minute, narrowly scoped
  HttpOnly Secure SameSite=Strict cookie. Validate its hash, state, expiry and
  server customerKey before exchanging the one-time authorization code.
- Exchange only once; an ambiguous timeout leaves it exchanging. Start a fresh
  authenticated enrollment session rather than blindly reusing the code.
- SDK settings own method deletion and future user-managed authentication.
  Access/refresh tokens are discarded, never returned or logged.
- List only own cards and reduce provider cardNumber to last four digits.
- Reuse the canonical EKODI login and return_to, including pending request intent.
  For a received invitation, keep the opaque token out of the login query:
  retain only this pending intent in tab-scoped sessionStorage with a 15-minute
  local TTL, remove on restoration, and restore its fragment after login.
  This is navigation intent, never identity, consent or financial authority.
  This implementation uses the existing apex browser session; expired sessions
  return to login rather than treating a local token as verified authority.

Sources checked 2026-11-27:

- https://docs.tosspayments.com/resources/glossary/brandpay
- https://docs.tosspayments.com/sdk/v2/js/brandpay
- https://docs.tosspayments.com/guides/v2/brandpay/auth
- https://docs.tosspayments.com/guides/v2/brandpay/integration

Brandpay registration accepts only the cardholder's own eligible payment methods.
Do not promise that a requester can register another person's card in their wallet.
Some issuer authentication paths may require existing issuer apps; promise no
separate **EKODI Pay app**, not universally installation-free issuer verification.

## Source-owned order and settlement adapter contract

EKODIPAY_ORDER_SERVICE is an explicitly approved internal service binding; it is
**not configured or implemented by the existing public demo**. Its source-owned
implementation must reuse each source's existing authentication/authorization,
order locks, confirmation and reconciliation. Never use an adapter that simply
echoes its input, browser JSON or arbitrary URLs.

Required RPC methods:

1. authorizePaymentRequest({userId,service,orderId}) must verify the canonical
   requester is the order owner, merchant/product/MID approval, non-expired
   payable status, delegation consent policy, authoritative amount and revision.
   Return allowed:true, delegationAllowed:true, userId, service, orderId,
   workspaceId, profileId, merchantName, revision, amount, currency:'KRW',
   status:'awaiting_payment'. Revalidate this on every inspection/acceptance.
2. createDelegatedCheckout({requestId,userId,requesterId,service,orderId,
   workspaceId,profileId,revision,amount,currency}) must atomically reserve the
   **same original order** and be idempotent by requestId. Competing checkout
   paths must share that reservation. No duplicate independently payable order.
   It must recheck amount/revision and use payer credentials, not requester
   customerKey. Return allowed:true, requestId, userId, orderId,
   usesPayerCredentials:true, orderOwnerChanged:false, checkoutUrl. The URL is
   restricted to the corresponding canonical EKODI source path, with only
   opaque orderId/checkoutId query parameters. Payment confirmation, cancellation,
   receipt and reconciliation stay in the source service.
3. sellerWorkspaces({userId}) returns the exact userId and only authorized
   workspaces:[{id,name,accountingAllowed:true}]. The UI uses this list rather than
   asking a seller to type an internal workspace ID.
4. sellerSettlementReport({userId,workspaceId,startDate,endDate,cursor}) must
   authorize the exact user's accounting access inside that immutable workspace.
   A tenant role string or platform admin role alone never grants another
   seller's records. Return authorization:{allowed:true,userId,workspaceId},
   source, fetchedAt, settlementTerms, complete, nextCursor, rows.
   Each row may contain orderId,soldDate,gross,refunds,fees,net,scheduledDate,
   status,paidAt,evidenceRef. paid requires actual provider/accounting payout
   evidence. Payment approvedAt is **not** merchant payout paidAt. Project only
   allowlisted fields; never include buyer PII, bank accounts or payment keys.

The first verified source adapter should target EKODIBIZ's approved direct-sales
scope. Independent businesses retain their own merchant authority and contracts;
this change does not promote ordinary tenant users into EKODIBIZ revenue owners.
Existing Mall seller reports remain available via the seller-studio link.

Delegated requests use random 256-bit tokens, hash-only storage, 15-minute expiry,
one active request per source order and CAS payer binding. Tokens live in a URL
fragment and authenticated POST body, never in a request URL query. Do not
automatically send messages. A claimed request is **not paid**. On ambiguous
source errors, only the bound payer may retry the same idempotent request.
Do not unlock/reassign it without the source's authoritative reconciliation.

## Fast settlements and truth

Report the actual contractual schedule and provider-confirmed scheduled dates.
Unknown amounts/dates remain null, not invented zeroes or D+1 promises. Retain
negative refund/adjustment values. Distinguish held/failed/scheduled/unconfirmed/
paid. Partial pages are explicitly labelled and CSV contains the loaded rows only.
No payout, accelerated-settlement application, loan or refund execution endpoint
exists in this extension.

Relevant provider references:

- https://docs.tosspayments.com/reference (settlement records and their timing)
- https://docs.tosspayments.com/guides/v2/payouts (available vs pending funds)

## Guarded activation and acceptance

1. Pass regression/security/mission/constitution checks on the exact PR SHA.
   Official provenance recovery and protected merge remain required.
2. Publish new pages through deploy-ekodipay.yml with all new financial flags off.
   Verify the real apex pages and native desktop/mobile browser artifacts.
3. Review actual Brandpay contract/MID/product coverage and settlement terms
   with the merchant's authorized operator. No contract or fee commitment is
   inferred from the user's general instruction to build.
4. Apply the additive migration through the approved D1 lane in an isolated
   staging namespace; bind the database only after schema verification.
5. Implement and independently verify source-owned RPC adapters against their
   real order/reservation/settlement contracts, including cross-source locking.
6. With approved test credentials verify actual provider enrollment and SDK
   callback cookies/CSP, wrong-customer denial, failed/expired session recovery,
   cancellation, source checkout, idempotency and seller isolation.
7. Activate an explicitly approved bounded live scope through the existing
   release process. Verify actual owner-authenticated card enrollment and
   contractual settlement evidence before claiming financial service completion.
8. Rollback is disable the three new flags through the same guarded release;
   retain audit records and source order reconciliation. Never drop tables.

New D1 tables contain opaque identity mappings, expiring registration/request
state and minimal append-only events. No public schema bootstrap. Before live
activation set and verify retention/cleanup under the existing scheduler:
purge expired registration state after the operational troubleshooting window,
retain order/audit records according to the merchant's reviewed retention policy.
Never purge claimed financial requests without source reconciliation.

## Validation evidence scope

Local Node 24 tests exercise actual SQLite queries and schema, authorization
boundaries, callback replay/timeout, amount changes, malicious URLs, request
claims, card projection, settlement nulls and false payout claims.
These are fixture tests, **not** a real provider sandbox or bank settlement.
The public production extension remains disabled until the conditions above
are independently evidenced. No external AI consultation is claimed from a
locally generated plan or static policy check.

## Official continuation and discovered production baseline

EKODI's authoritative recovery created PR #10453 and issued task
orch_recovery_80479d3ccee8f2d8e537c9b286a589ea. The public release-receipt endpoint
verified this exact task/branch with authority ekodi-orchestrator, state assigned.
Source PR #10452 was superseded automatically. No human approval is fabricated.

The first native browser run 45918684398 reached the existing live homepage and
demo on desktop/mobile, but correctly failed on a pre-existing inline-script CSP
error. New account pages were not deployed yet. Cloudflare's documented JavaScript
Detections behaviour matches this error and supports random response-header
nonces. This continuation adds per-response nonces to the Pay HTML policies,
retaining self-only/approved-provider sources and the ban on unsafe-inline script.
It does not ignore the failed verification or disable bot detection. Verify the
inference against actual postrelease native evidence before claiming resolution.

Reference checked 2026-11-27:
https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/

Both #10453 and nonce correction #10455 subsequently merged through the official
Orchestrator. Guarded Pay deployments 45918958445 and 45919406890 succeeded.
Replaying the superseded source PR's browser job failed before executing a
browser because refs/pull/10452/merge no longer existed. Native PR checkouts now
use the immutable PR head SHA, preserving source identity and making future
postrelease reruns independent of PR closure. The verifier now requires the
deployed account-UI marker and response-header nonces on every new view.
This is a verification recovery, not evidence that the final browser run passed.

Native run 45919803320 verified homepage/demo, all four desktop/mobile account
routes (HTTP 200, no overflow), active response nonces and disabled financial
gates. It still correctly failed: account JavaScript raised "__name is not
defined". Wrangler's function-name preservation injected a helper into the
function that had been serialized with toString, leaving that helper outside
the browser payload. The client is now static text, so the bundler cannot rewrite
its closure. A regression test imports the actual dry-run Worker, requests its
browser asset and boots every view in an isolated VM with no bundler globals.
This test now runs after the guarded release lane's bundle dry-run. A fresh live
native run must still succeed before declaring account-screen acceptance.
