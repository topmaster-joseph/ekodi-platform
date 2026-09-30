# EKODI Personal Finance AI Reference Service

Status: foundation reference implementation
Service ID: `personal-finance-ai`
Responsibility: `EKODI Responsible Independent Service`

## Purpose

Personal Finance AI is the first reference implementation of the EKODI Responsible Independent Service model.
It is not an EKODI Core feature and it is not owned by a Workspace.
EKODI remains accountable for service quality, security, privacy controls, observability, fallback design and user protection.
The service keeps its own finance-domain data boundary and can be deployed, replaced, scaled or extracted independently.

## Surface composition

The user experience is intentionally composed from two separate boundaries:

- `EKODI Money` is the public discovery, cleanup-guidance, consent-preview and official-provider handoff surface.
- `personal-finance-api.ekodi.kr` is the private person-scoped financial ledger, evidence and insight API.
- `My EKODI` is the authenticated personal control surface that may consume the private API.

The public Money surface never receives private ledger access merely because it shares the same product experience.
## Data boundary

`PERSONAL_DB` owns finance-private operational data such as accounts, transactions, recurring patterns, evidence, insights and action requests.
EKODI Core keeps only the minimum identity, authorization, consent summary, connection metadata and audit references required for safe cooperation.
Full account numbers, PINs, card security codes, passwords and financial provider credentials are not stored in this ledger.

Cross-service sharing defaults to an insight projection, not raw transaction replication.
A travel, insurance, work or business service may receive only the minimum approved projection needed for its purpose.

## AI action levels

- L0 Observe: read already-authorized data and detect patterns.
- L1 Analyze: classify, compare, forecast and explain.
- L2 Recommend: surface risk, propose choices and ask for confirmation.
- L3 Execute after fresh approval: reserved for separately implemented and approved actions.
- L4 Bounded pre-authorized execution: disabled unless a separate policy explicitly enables a narrow reversible rule.

The default ceiling is L2. Financial execution is disabled in the reference foundation.
## Evidence-first insight model

Every material AI insight links back to evidence and source provenance.
The user can inspect why the service reached a conclusion and can confirm, correct, dismiss or revoke the underlying use permission.
This avoids turning model output into an unexplained financial fact.

`Insight -> Evidence -> Source`

Examples include recurring-payment detection, abnormal expense growth, upcoming fixed costs and cash-flow forecasts.

## Provider and connector model

Banks, card companies, insurers, AccountInfo, email providers and official-data providers remain External Connected Services.
They connect through scoped adapters or gateways and never receive direct access to `PERSONAL_DB`.
External AI or specialist finance engines may implement compatible capabilities, but they receive only purpose-bound projections.
Provider replacement must not change EKODI canonical person identity or the finance service's ownership of its ledger.

## Boundary with Life AI

`life.ekodi.kr/money` remains a Life AI conversation topic about values, choices and the meaning of money.
It is not a financial ledger surface and has no direct access to private Personal Finance data.
When useful, it may receive a user-authorized, minimum finance insight projection such as a budget range or trend.
## Reference-service rule

A future EKODI Responsible Independent Service should reuse this pattern instead of copying Personal Finance business logic.
It must declare its own responsibility boundary, data boundary, action levels, projection policy, evidence policy, connection contracts, provider replacement path, export path and guarded production lifecycle.

The reference principle is:

> One accountable EKODI service, independently executable internals, standardized connections, and user-owned consent boundaries.

This document describes architecture and safety contracts only. Regulated financial data access remains inactive until the required provider contracts, legal basis, security review and explicit user authorization are complete.
