# EKODI-AUTO-DISPATCH-001 — Unified AI automatic direction

## Approved default (2026-10-19)

- AI provider choice: **automatic**; users describe the goal, not the model.
- Paid API: **no automatic expenditure**; existing explicit delegated-budget and paid-commitment checks are mandatory.
- Cross-review: **high/critical risk or high/critical complexity**; an independent provider is required before the AI answer can be treated as reviewed.
- Browser: **official cloud/API and EKODI-controlled headless/cloud first**; local Opera is not an unattended fallback, even when configured. A manual explicit invocation may opt in.
- Security, permissions, Human Gate, CI, protected release, rollback and production-verification policies remain authoritative.

## Runtime surfaces (reuse; no new service)

| Concern | Existing authority |
| --- | --- |
| Intent/capability registration | `capability-intent-runtime.js`, `config/capability-registry.json` |
| AI provider selection | `ai-orchestrator-runtime.js`, `ai-resource-policy.js` |
| Free/Core fallback | `ai-resilience-runtime.js`, `core-ai-gateway.js` |
| Budget hard gate | `ai-cost-policy.js`, `config/ai-cost-policy.json` |
| Cloud connection selection | `cloud-connection-runtime.js`, `config/cloud-connection-policy.json` |
| Approval, authorized execution and verification | `ekodi-command-plane.js`, `ekodi-capability-executor.js`, `ORCHESTRATOR_PRODUCTION_CONTRACT.md` |

## Mandatory safeguards

1. A routine request uses a single eligible provider at most, after deterministic/Core opportunities are exhausted; do not call an extra reviewer by default.
2. A high-risk or high-complexity request may not be silently downgraded to primary-only mode. If the reviewer is unavailable, use Free Assist/Core, not an unreviewed high-impact AI success claim.
3. Unverified, unknown-cost or metered providers must not be silently promoted to a paid API; the existing cost gate remains enforced independently of routing.
4. Unattended work must use server-callable, authorized API or cloud execution paths. Consumer chat web sessions and foreground laptop Opera automation are not allowed.
5. AI model/provider results are advice or execution evidence, **not** proof of completion. Only the EKODI Orchestrator can settle an authoritative task state after checks.
6. These rules do not grant new production privileges. Preserve per-task Human Gate approval receipts and scoped identity checks.

## Deployment checklist

- `node --test test/ai-auto-dispatch-policy.test.mjs test/ai-orchestrator-runtime.test.mjs test/cloud-connection-runtime.test.mjs test/ai-orchestration-contract.test.mjs`
- `npm run validate:ai-cost`
- Run required repository CI (including provider-none survival and existing security/deployment guards).
- Protect the default branch: create a PR, verify its exact commit, obtain authorized approval where needed.
- Release only through the existing EKODI protected Orchestrator path, then record production and browser evidence.

**Scope:** This change locks down policy and existing runtime selectors. It does not claim that Codex/Claude subscriptions are newly automated, that cloud-browser credentials are connected, or that production deployment has occurred. Those need provider-specific authorized adapters and end-to-end verification before being reported as active.
