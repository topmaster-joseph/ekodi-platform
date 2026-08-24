# EKODI User Service Operating Baseline

Updated: 2026-08-24

This document is the completion gate for every user-facing EKODI service.

## Required operating contract

A service is not considered operational merely because a hostname resolves. It must preserve these shared rules:

1. **Identity**: EKODI uses `Person + Space + Role + Capability`. Platform administrator authority is separate from tenant or activity roles.
2. **Membership**: one EKODI account receives the universal FREE eligibility. Reading My EKODI or the service catalog must not create a subscription row. FREE is materialized only when the user actually enters/uses a service. Paid plans remain service-specific and never grant admin authority.
3. **Shell**: every user-facing service uses EKODI Shell v2 or a reviewed equivalent adapter, including the shared mobile fixed-header and safe-area behavior.
4. **AI resilience**: external AI is optional enhancement. Provider failure degrades to EKODI Core behavior and must not disable the service's essential non-AI path.
5. **Data boundaries**: one service does not directly read another service's private records. Cross-service exchange uses public data or an explicit authorized API contract.
6. **Admin boundary**: user pages do not become administrator consoles. Administrative actions hand off to `admin.ekodi.kr` and are independently authorized.
7. **Release safety**: syntax/contracts are checked before release. Independent services use isolated staging when available. Shared edge services use guarded 0% candidate verification, promotion, and rollback. Production completion is verified against the real public hostname.
8. **Observability**: active services are included automatically in ecosystem monitoring. New services must not require a hand-edited monitoring allowlist.

## Shared bridge services

`trade`, `pay`, `mail`, `live`, `cloud`, `insurance`, and `media` currently use the declared low-data shared edge runtime. The bridge owns no private domain records and exposes a common `/health` contract. Canonical service URLs remain stable if these domains are split into independent Workers later.

Safety-specific boundaries:

- **Pay**: payment/billing handoff only; purchase or subscription does not create administrator authority.
- **Insurance**: information organization and claims preparation only. No autonomous enrollment, final product recommendation, coverage determination, claim approval, or submission.
- **Media/Live**: external provider actions require the owning user's/channel's authorization; Core navigation and records remain available when providers fail.
- **Cloud/Mail**: original provider ownership and permissions remain authoritative; EKODI does not copy or bypass private data access.

## Independent services completed on this baseline

- **Education**: Admission and Study remain one Education platform with central Auth, Shell and guarded production verification.
- **Cafe**: digital imagination Beta only. `physicalPlaceOpen=false` remains explicit until a real-world opening is verified.
- **Publishing**: independent professional publishing service with isolated PR staging, production recovery bootstrap, guarded updates, persisted production probes and Shell v2.

The canonical registry and service manifest are the source of truth. `productionVerified` is promoted only after the corresponding real-host release evidence is successful.
