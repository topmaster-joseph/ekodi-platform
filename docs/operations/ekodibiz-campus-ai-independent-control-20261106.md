# EKODIBIZ Campus AI — Independent Operations Control (EKODI Orchestrator)

- task_id: `campus-ai-independent-control-20261106`
- owner: EKODI Orchestrator
- legal/accounting organization: `EKODIBIZ` ONLY; no merging with EKODI Church, Mission, CGMA or partner funds
- state: **non-production candidate**. This capability must not be presented as a deployed service or proof of legal compliance.
- related pending source PRs: #8150 (3-month agreement, privacy and payment gates), #8157 (EKODI-owned read-only FSC/BOK public browser).

## Operational independence: precise meaning

EKODI can independently preserve **university agreements, consent references, cost ceilings, cancellation evidence, account-ownership records, audit, notifications and operating task status** using its own Core and first-party compute. It does not require TinyFish, hosted remote-browser services or a continuously available LLM. The actual consumer ChatGPT/Claude/Gemini subscription, licensing permission, foreign exchange rails, and regulator processing remain third-party services; cannot be guaranteed by an EKODI runtime.

## Components (capability-first, reuse-first)

1. Existing `ekodi-autonomic-reconciler.js` evaluates fixed first-party health rules. This module only projects sanitized rule codes and statuses — never raw observations or personal details.
2. `ekodibiz-campus-ai-independent-operations.js`: pure, deterministic, model-free read-only status/incident/task proposal.
3. `scripts/inspect-ekodibiz-campus-ai.mjs`: self-hosted Node CLI; stdin JSON observation → sanitized JSON stdout and exit status. It invokes no networks, provider logins, OAuth, browser, PG or payment APIs.
4. EKODI native Chromium is a preferred independent browser runtime. It stays subject to its own origin, authorization and credentials policies; the pending #8157 adapter is **read-only** and does not submit legal filings.

## Fail-safe contract

- On supplier outage, local financial/contract recordkeeping must continue in `PROVIDER_DEGRADED_CORE_ONLY`, with public-status check recommendations. Do not silently switch user accounts or vendors.
- On critical local ledger/tenant isolation/audit outage, stop claiming local readiness and raise first-party health checks; no payment or mutation.
- On missing or stale timestamps, emit `OBSERVATION_UNKNOWN`; missing evidence never becomes 'healthy'.
- On absent vendor written approval, FSC PG judgment, BOK FX judgment, tax review, funding or explicit authorization, emit human compliance review. Never infer a PG exemption.
- When a cancellation receipt is missing or a possible fourth charge exists, raise a **human-owned cancellation proof** task; never delete the personal account, silently cancel a service, make a fourth charge or collect a password/OTP.
- Idempotent proposed tasks have zero payment privileges and bounded attempts. This module does **not** actually enqueue those tasks yet; EKODI's existing audited command ledger is the proposed adapter when approved.
- Synthetic status **must not** be treated as authenticated evidence. A production connector must validate source/tenant/signed observations before any operational readiness claim; even a fully clean observation cannot authorize payment.

## CLI example

```sh
node scripts/inspect-ekodibiz-campus-ai.mjs < sanitized-campus-ai-observation.json
```

A sample observation requires: UTC ISO `observedAt`, `runtime.local` booleans for ledger, tenant isolation, audit, queue, finance, native browser and recovery path; `external` supplier and official portal status; `approvals` booleans; and `termination` aggregate counts. Never include emails, accounts, credentials, card data or chat content.

Exit: 0 for valid non-critical observation; 3 for local core disruption or potential fourth-charge risk; 2 for malformed input. Exit 0 does not mean business/PG approval or production readiness. Output reports `paymentAuthorized:false`, `legalFilingSubmitted:false`, `subscriptionChanged:false` unconditionally.

## Existing EKODI integration plan — NOT YET DEPLOYED
- Data snapshot source: authorized EKODI Core with tenant/workspace scope and signed/verifiable proof. Do not accept arbitrary browser-posted approval booleans as source authority.
- Run plan: schedule an internal bounded EKODI OS/command-ledger read-only inspection. Do not create a second scheduler, external SaaS dependence or dedicated application without governance approval.
- Execution path: any automated health recheck stays within first-party read-only capabilities; legal filings, vendor charges, account changes, refunds and production secrets require separate reviewed human authority.
- Data: no model sessions required, no non-EKODIBIZ account access, no unverified cross-university read. Persist only verified incidents and minimal audit references if a store integration is authorized.
- Recovery: bounded retries, circuit-break when quota/auth/third-party failure persists; release via protected orchestrator provenance only.

## Constitutional assessment — all 21 Supreme Attributes

Independent contract data and model-free execution preserve Independence, Data Sovereignty, Replaceability and Economic Sustainability. Reusing the reconciler/command ledger supports Simplicity, Standardization, Consistency, Modularity and Interoperability. Bounded read-only retries, source evidence and stable incidents support Resilience, Observability, Verifiability, Reversibility and Adaptability. Isolated branches, tests and human-owned approvals preserve Security, Collaboration, Agility, Autonomous Operations, Scalability, Evolvability and Creativity. No mandatory security/data/human authority floor is relaxed.

## Validation & completion gates

```sh
node --test test/ekodibiz-campus-ai-independent-operations.test.mjs test/ekodibiz-campus-ai-monitor-cli.test.mjs
node --check ekodibiz-campus-ai-independent-operations.js
node --check scripts/inspect-ekodibiz-campus-ai.mjs
```

The task PR is a candidate only. EKODI orchestrator must review it and issue an official `orch_` provenance release PR. Verification of any *production integration* requires approved upstream data, read-only canary, tenant authorization negatives, rollback, real hostname, and incident observation. Product claims cannot exceed evidence.

**External authority blockers:** FSC written classification, BOK FX reply, official provider authorization for third-party paid personal accounts, actual university contract, tax and funds clearance. These are not resolved by passing the module's tests.
