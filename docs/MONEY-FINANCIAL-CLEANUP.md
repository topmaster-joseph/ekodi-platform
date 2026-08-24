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

## Human gate

The following actions always require a human gate: `transfer-balance`, `close-account`, `change-autopay`, `cancel-autopay`, `close-card`, `payment`, `withdraw`, `sign`.

The Worker returns `409 financial_execution_disabled` for `/api/execution` in V1. This is a product boundary, not a temporary UI omission.

## Data boundary

V1 persists no financial planning payload. Browser UI uses demonstration aliases and relationship metadata only. Any future persistent `money_*` namespace or financial API adapter requires explicit legal, privacy, security, authorization, audit, revocation, retention and incident-response review.

## Future integration gate

AccountInfo, Open Banking, MyData or another financial integration may be added only through a reviewed server-side contract with:
- explicit user consent and revocation;
- purpose limitation and minimum data collection;
- server-side encrypted secrets/tokens where applicable;
- Person + Space + Role re-authorization;
- immutable audit events for high-impact actions;
- human confirmation immediately before irreversible financial execution;
- production verification and rollback/incident controls.

No consumer browser session or AI-provider session may be used as a substitute for an authorized financial API.
