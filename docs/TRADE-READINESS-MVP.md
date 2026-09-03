# EKODI Trade Readiness MVP

## Purpose

EKODI Trade Readiness is a reusable, tenant-scoped trade operating module. It is not owned by one importer, supplier, customer, or country pair. The first reference case is trade between a Korean operating workspace and Harbin Jixing Heater Co., but the domain contract must remain reusable for other suppliers, buyers, products, countries, and EKODI customer workspaces.

The module owns trade orchestration. It does not absorb Finance, Business OS, authentication, document storage, customs-broker systems, or certification authorities. Those systems remain independent and connect through explicit contracts.

## Operating flow

`counterparty due diligence -> product/spec -> quotation -> contract/PO -> production -> export documents -> freight -> Korean customs -> inventory/lot -> domestic delivery -> settlement -> warranty/RMA -> audit`

Each trade case uses an immutable `workspaceId` for tenant scope. Human identity and authority are resolved by EKODI identity/membership services rather than encoded in the trade record.

## MVP aggregates

### Counterparty
- supplier/buyer legal name
- country and registration identifiers
- verified bank-account fingerprint/status
- contacts and languages
- due-diligence status and review date
- sanctions/compliance review result where applicable

### Product
- SKU/model
- manufacturer
- specifications and voltage/fuel variants
- HS classification candidate and confirmed classification
- origin
- certification/compliance requirements
- warranty terms

### Trade case
- quotation and PO references
- Incoterm and currency
- commercial invoice / packing list / transport document
- certificate of origin when FTA benefit is claimed
- compliance evidence for regulated goods
- production, shipment, customs, release, delivery state
- landed-cost ledger
- payable/paid and receivable/received amounts
- lots/serials and warranty/RMA linkage

## Human gates

AI may inspect data, identify missing evidence, calculate deterministic cost, draft documents, recommend actions, and prepare handoffs. AI must not autonomously perform legally or financially binding steps.

Human confirmation is required at minimum for:
- contract acceptance
- payment release
- customs declaration confirmation
- FTA origin claim
- regulatory/certification release
- destructive cancellation or irreversible data correction

## Jixing reference onboarding

Create a supplier master record for `哈尔滨吉星加热器有限公司` only after its official Chinese registration evidence and receiving-bank account are independently verified. The WeChat contact is a communication identifier, not evidence of payment authority.

Before the first production import case, collect:
- official company registration copy
- legal representative / authorized trade contact
- corporate receiving bank account and beneficiary name
- product catalog and exact model list
- model-specific specifications
- quotation and MOQ
- Incoterm and lead time
- warranty / spare-parts / RMA policy
- prior Korean supply references when voluntarily provided
- HS-code basis
- FTA certificate-of-origin capability
- Korean compliance/certification evidence per model where required

Never store passwords, bank credentials, private keys, or payment secrets in trade-case data.

## Korea operating-base readiness

The system keeps commercial transactions separate from the legal form of the Korean presence. A Korea branch, wholly owned Korean subsidiary, JV, or third-party importer can each be represented as an operating counterparty/workspace without rewriting the trade core.

For a future Jixing Korea entity, add an operating workspace and migrate contracts only through explicit legal assignment/novation where required. Historical transactions remain attributed to the entity that actually contracted and paid/received them.

## Integrations

- **EKODI Identity / My**: membership and tenant authority
- **Business OS**: customer/order operating views
- **Finance / Money / Pay**: accounting handoff, receivable/payable and human-confirmed payments
- **EKODI Cloud or external document store**: document objects by reference, not embedded secrets
- **Admin**: health, exceptions, overdue evidence, audit visibility
- **AI Gateway**: optional document classification/translation/recommendation behind provider-independent governance

## Initial dashboards

1. Today's exceptions: missing documents, blocked shipment, certification expiry, customs hold.
2. Shipments: production / ready / transit / customs / released / delivered.
3. Money exposure: payable outstanding, receivable outstanding, landed cost, expected gross margin.
4. Compliance: HS status, FTA evidence, model certification state.
5. After-sales: lots, serials, warranty claims and RMA.

## Data-boundary rule

Trade records are tenant-scoped. Cross-tenant aggregation is allowed only in an explicit platform-admin analytics context and must not grant one customer access to another customer's commercial data.

## Definition of done for production

The current branch is an MVP domain-core change, not a production release. Production completion additionally requires persistence/API wiring, tenant authorization enforcement, UI, audit log, migrations, integration tests, guarded deployment, real-host verification, monitoring, and admin observability.
