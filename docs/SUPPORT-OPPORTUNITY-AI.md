# EKODI Support Opportunity AI

## Status
Foundation contract for the government-support and external-opportunity product area.

## Purpose
EKODI Support Opportunity AI helps a person or organization discover, evaluate, prepare, apply for, execute, evidence, settle, and learn from government support programs and other external opportunities without turning AI into an unbounded decision maker.

This product follows `AGENTS.md`, `config/ai-mission-governance.json`, `ai-governance.js`, and platform isolation rules. It does not weaken human gates, tenant isolation, or official-document authority.

## Product boundary
The capability is composed of four logical modules:

1. **Opportunity AI** — discovers programs and evaluates eligibility, fit, deadlines, constraints, and preparation gaps.
2. **Grant Workspace** — creates one tenant-scoped workspace per application/program and tracks its lifecycle.
3. **Form Engine** — maps official notices, guidelines, attachments, and forms to known tenant data and drafts only what evidence supports.
4. **Project AI** — after selection, manages agreement, execution, change requests, evidence, reporting, settlement, and follow-on opportunities.

These are product capabilities over EKODI Core contracts, not permission to create a new shared monolith. Platform-specific code and private tenant data remain isolated.

## Lifecycle
`discovered → reviewing → preparing → submitted → screening → presentation → selected → agreement → executing → interim_review → final_report → settlement → completed → follow_on`

A workspace must preserve status history rather than overwrite the audit trail.

## Source-of-truth hierarchy
When interpreting a program, use this order unless law or the issuing authority explicitly establishes another precedence:

1. current official notice and formal amendments
2. current official implementation/operation guideline
3. current official attached forms and submission instructions
4. official FAQ, Q&A, email, or written notice from the administering organization
5. prior official versions, retained for comparison only
6. tenant-provided supporting evidence
7. AI inference, clearly labeled and never promoted to an official rule

Important fields such as eligibility, amount, matching funds, deadline, evaluation criteria, prohibited spending, evidence requirements, and submission method must retain provenance to the source document and version.

## Update and change analysis
New program information is additive and versioned. On ingestion, the system should produce:

- `NEW`: newly introduced requirement or information
- `CHANGED`: difference from the prior authoritative version
- `IMPACT`: effect on this tenant/application
- `ACTION`: recommended next action
- `DEADLINE`: applicable date/time and source
- `DOCUMENT`: document/form that must be created or revised

AI must not silently replace a prior rule. Conflicts, ambiguity, and uncertain precedence are escalated for human review.

## Form Engine contract
Official forms are authoritative when provided. The engine should:

`ingest → identify form/version → extract fields/sections → map evidence → prefill known facts → request missing facts → draft supported narrative → validate → human review → export`

Rules:

- preserve the official form structure whenever technically feasible
- never fabricate registration numbers, revenue, employment, certifications, dates, signatures, seals, quotations, invoices, performance figures, or other evidence
- mark unsupported or uncertain fields instead of guessing
- separate factual prefill from generated narrative
- keep field-level provenance where practical
- require human approval before legally binding, financial, submission, signature, or certification actions
- treat complex HWP layouts, external submission portals, identity verification, electronic signatures, and authority-only systems as assisted workflows unless a verified server-side integration exists

## Human gates
Human approval is mandatory for at least:

- final application submission
- declarations and certifications
- electronic signature or seal
- binding agreement acceptance
- budget or matching-fund commitment
- material budget/category change
- withdrawal or cancellation
- final performance report and settlement submission

The AI may prepare, compare, validate, and recommend. It must not conceal material uncertainty to accelerate submission.

## Tenant data and reuse
Reusable organization facts and approved evidence may be referenced through EKODI Core, but access must remain tenant-, role-, and purpose-scoped. Completion of one program may improve future preparation through approved reusable facts, outcomes, and evidence, but cross-tenant learning must not expose another tenant's private data.

## User AI and Admin AI
**EKODI User AI / 개인 AI 비서** presents tenant-specific opportunities, gaps, deadlines, changes, and next actions.

**EKODI Admin AI / 운영 AI 직원** may aggregate operational status only within delegated administrative scope. It must not silently apply, submit, commit funds, or expose one tenant's private materials to another.

## MVP order
1. tenant/organization profile mapping
2. official notice and attachment ingestion
3. eligibility and fit analysis with provenance
4. Grant Workspace lifecycle and deadline tracking
5. version/change analysis
6. Form Engine field mapping and supported drafting
7. human review/approval queue
8. post-selection agreement, evidence, report, and settlement tracking

## Definition of done for this product area
A feature is not complete merely because an AI generated text or code was committed. Applicable repository checks must pass, mission governance must pass, deployment must succeed, the real production endpoint must be verified, the admin control plane must be able to observe state, and failures must be auditable, consistent with `AGENTS.md`.

## Initial validation case
Use a real EKODI-managed support-program workflow as a controlled validation case, with sensitive data minimized. Validate the full chain of notice → attachments → changes → forms → review gates → selection-stage transition → execution/evidence/reporting before generalizing automation.
