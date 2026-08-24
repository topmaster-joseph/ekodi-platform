# EKODI Money · Financial Cleanup

## Purpose

EKODI Money helps a person or authorized workspace discover financial clutter, understand account relationships, build a safe cleanup order, and hand off high-impact execution to an authorized financial channel.

It is not a bank, custodian, autonomous payment agent, or credential collector.

## V1 contract

Flow: `discover → review → plan → confirm → official handoff → verify`.

V1 can:
- classify account aliases and non-sensitive planning metadata as `keep`, `review`, `cleanup`, or `attention`;
- place automatic-debit migration before balance transfer and account closure;
- explain why an item is risky or worth reviewing;
- link a user to the official AccountInfo channel;
- expose deterministic action-gate and analysis APIs for EKODI UI surfaces.

V1 cannot:
- collect account numbers, resident-registration numbers, passwords, PINs, card numbers, CVC/CVV, access tokens, or refresh tokens;
- transfer money, close an account, cancel/change automatic payment, sign, withdraw, or make a payment;
- treat AI output as a substitute for a user's informed decision or a financial institution's eligibility check.

## V2 integration-readiness layer

V2 adds a regulated connection layer without pretending that uncontracted financial APIs are live.

Provider states:
- `accountinfo`: available as an official handoff. EKODI does not receive the user's financial credentials or AccountInfo session.
- `kftc-openbanking`: contract-required. The server adapter remains disabled until an institutional contract, client configuration, redirect configuration and OAuth state-store readiness are all present.
- `financial-mydata`: legal-review. The product must first establish the applicable licensed/contracted data-access model and minimum processing scope.

V2 APIs:
- `GET /api/integrations` returns provider readiness and capability boundaries.
- `POST /api/consent/preview` returns a minimum-scope consent preview for supported read scopes.
- `POST /api/consent/revoke` confirms revocation semantics. In the readiness phase no durable financial connection is stored.
- `POST /api/connect/begin` opens AccountInfo as an official handoff and returns `503 provider_not_live` for uncontracted API providers.
- `POST /api/execution` continues to return `409 financial_execution_disabled`.

Allowed consent-preview scopes are read-only: `accounts:read`, `balances:read`, `transactions:read`, `cards:read`, `insurance:read`, `loans:read`, `autopay:read`. Write/payment scopes are intentionally excluded.

## Human gate

The following actions always require a human gate: `transfer-balance`, `close-account`, `change-autopay`, `cancel-autopay`, `close-card`, `payment`, `withdraw`, `sign`.

The Worker returns `409 financial_execution_disabled` for `/api/execution`. This is a product boundary, not a temporary UI omission.

## Data boundary

The V2 readiness phase persists no financial planning payload, OAuth token, financial account identifier or financial credential. Browser UI uses demonstration aliases and relationship metadata only.

The Worker may emit privacy-minimized security events containing only event type, provider id, action label, scope count and timestamp. Those events must not contain account numbers, card numbers, resident-registration numbers, tokens, secrets, balances or transaction content.

Any future persistent `money_*` namespace or financial API adapter requires explicit legal, privacy, security, authorization, audit, revocation, retention and incident-response review.

## Activation gate for Open Banking

A live Open Banking adapter must not be activated merely by adding a client id. Production readiness requires all of the following:
- institutional application/contract approval for the intended API use;
- server-side client configuration and approved redirect URI;
- cryptographically protected OAuth state/session storage and replay protection;
- explicit user authentication, consent and revocation;
- purpose limitation and minimum data collection;
- server-side encrypted secrets/tokens where applicable;
- Person + Space + Role re-authorization inside EKODI;
- immutable audit events for high-impact actions;
- human confirmation immediately before irreversible financial execution;
- production verification, rollback and incident controls.

Even after read APIs are enabled, transfer, withdrawal, account closure and autopay modification remain separately gated high-impact actions.

No consumer browser session or AI-provider session may be used as a substitute for an authorized financial API.
