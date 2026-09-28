# EKODI Money · KFTC Open Banking Application Readiness

Status: `pre-application / contract-required`

Canonical EKODI surface: `https://ekodi.kr/money`
Approved OAuth redirect target to request: `https://ekodi.kr/money/oauth/kftc/callback`

This document is an internal launch checklist. It does not represent approval by the Korea Financial Telecommunications & Clearings Institute (KFTC).

## Official references

- KFTC Open API portal: https://openapi.kftc.or.kr/
- Application/use procedure: https://openapi.kftc.or.kr/intro/useProcedure
- Open Banking service overview: https://openapi.kftc.or.kr/service/openBanking
- User authentication API overview: https://openapi.kftc.or.kr/openapi/openbanking/userAuth

KFTC states that use of Open APIs requires portal registration followed by API application and contract procedures. Development-site testing may be available before service application, subject to service-specific eligibility.

## EKODI Money intended first API scope

Start with inquiry-only capabilities. Do not request transfer/write authority in the first institutional application unless a separate business and compliance review approves it.

Initial desired capabilities:
- balance inquiry;
- transaction-history inquiry;
- account relationship discovery where permitted;
- additional financial-product data only through a separately approved provider/service; Open Banking approval is not treated as approval for card, insurance or loan data;
- user authentication/consent management required for those inquiry APIs.

Explicitly out of first activation:
- deposit transfer;
- withdrawal transfer;
- account closure;
- autopay modification/cancellation;
- payment initiation;
- any autonomous AI financial execution.

## Application package to prepare

Before submitting an institutional application, prepare and review:
- legal entity/applicant identity and authorized representative information;
- EKODI Money service description and user journey;
- precise API list and purpose for each API;
- expected users and transaction/inquiry volume assumptions;
- privacy policy and personal-credit-information handling description;
- user consent, withdrawal and revocation flow;
- data minimization, retention and deletion policy;
- infrastructure/network architecture and server endpoints;
- approved redirect URI and OAuth session/state design;
- encryption/key management and secret-storage design;
- access control based on Person + Space + Role;
- security event and high-impact audit plan;
- incident response, account revocation and rollback procedure;
- customer support and complaint-handling contact;
- testing plan using the KFTC developer environment.

## EKODI activation checklist

The production adapter remains disabled until every required item is complete:

- [ ] KFTC institutional application accepted for the intended service model
- [ ] Contract / service approval completed
- [ ] Approved API scope recorded in EKODI configuration
- [ ] Production client identifier issued
- [ ] Approved redirect URI configured exactly as `https://ekodi.kr/money/oauth/kftc/callback`
- [ ] OAuth state/session store deployed with replay protection
- [ ] Token encryption and rotation implemented server-side
- [ ] Consent receipt + revocation storage implemented
- [ ] Data retention/deletion policy implemented
- [ ] Person + Space + Role authorization enforced server-side
- [ ] Read-only integration tests passed
- [ ] Privacy/security review signed off
- [ ] Production monitoring and incident runbook active

After these items are complete, `KFTC_OPENBANKING_ENABLED=true` may be considered. It must never be used as the sole activation switch: the runtime also requires contract approval, an issued client id, the exact canonical redirect URI, OAuth replay-safe state storage, encrypted token storage, consent storage, an approved read-scope list, and an explicitly attached server-side KFTC adapter. Until that adapter exists, `openBankingReadReady` remains false.

## Separate high-impact gate

Even after inquiry APIs are live, money movement and other high-impact financial actions remain separately disabled. Transfer, withdrawal, payment, account closure, autopay changes and signing require an additional reviewed human-confirmation architecture and must not be inferred from read-access approval.


## Read-only adapter foundation (2026-09-28)

EKODI now has a separate KFTC read-adapter boundary prepared for the official Open Banking contract.

- Worker: `ekodi-kftc-openbanking-adapter`
- Production public surface: none; the `workers.dev` endpoint is technical verification only.
- Canonical product entry remains `https://ekodi.kr/money`.
- Storage: existing EKODI D1 receives adapter-specific tables only; Money itself gets no direct DB binding.
- OAuth tokens and 24-digit fintech use numbers are stored only inside AES-GCM ciphertext.
- Raw account numbers are not collected by this adapter.
- Balance and transaction normalization follows the official KFTC read APIs.
- Transfer/deposit/withdraw endpoints are intentionally absent.
- `KFTC_OPENBANKING_CONTRACT_APPROVED`, `KFTC_OPENBANKING_LIVE_READ_ENABLED`, encryption key, internal service token, Client ID/Secret and issued bank-transaction prefix must all be configured before read calls can become live.
- User-facing OAuth remains fail-closed until the contracted API specification and approved app parameters are locked. The adapter returns a non-live response rather than guessing provider parameters.
