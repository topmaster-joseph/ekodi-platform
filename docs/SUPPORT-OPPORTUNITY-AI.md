# EKODI Support Opportunity AI

This platform manages the full lifecycle of government support programs and adjacent external opportunities under the EKODI Engineering Constitution.

## Product boundary
- Opportunity AI: discover and assess opportunities.
- Grant Workspace: keep one project room per application.
- Form Engine: map verified profile/project data into official forms without inventing missing facts.
- Project AI: support agreement, execution, evidence, reporting and settlement.

## Lifecycle
`discovery → fit-review → application-prep → submitted → document-review → presentation → selected → agreement → execution → mid-review → change-control → final-report → settlement → completed → follow-up`

## Source policy
Official announcement, implementation guideline, FAQ, notice, agreement guidance and official attachments take precedence. Every material recommendation should retain source provenance and version/date where available.

New guidance must be treated as a versioned change and summarized as NEW / CHANGED / IMPACT / ACTION / DEADLINE / DOCUMENT.

## Form policy
Official forms are authoritative. The system may prefill known values but must not fabricate unknown identifiers, financial values, eligibility facts, signatures or declarations. Missing or high-impact fields require human review.

## Human gates
Submission, signature, agreement, payment, budget change, settlement and withdrawal are never autonomously executed by AI. The first release prepares and checks these actions only.

## Tenant and data policy
A person or tenant's private application data must not be exposed across tenants. Browser workspace state is convenience state only and never an authorization mechanism.

## MVP
The first production release provides lifecycle tracking, deterministic opportunity scoring, guidance-change analysis, official-form prefill classification, next-action guidance, a health endpoint, shared EKODI Shell integration, isolated deployment and automated tests.

Persistence begins browser-local-first for non-sensitive planning metadata. Sensitive documents and authoritative application records require a reviewed server-side storage contract before they are enabled.

## Definition of done
A release is complete only after source checks, tests, platform-boundary validation, staging verification, production deployment and verification of the real `support.ekodi.kr` hostname.