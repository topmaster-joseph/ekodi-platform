# Public accounting notice — authenticated CI / official release checkpoint

Date: 2026-11-13 (Asia/Seoul).
Central owner intent issue: #9608.
Authoring source PR #9649 (closed as superseded), exact functional+test source SHA: `15d511074f3a552e1cc3d154f3b4363c781784bf`.
First-party EKODI Orchestrator recovery PR: #9650, task `orch_recovery_15d511074f3a552e1cc3d154f3b4363c`.
Previous flawed candidate: #9648, retired; corrected one test's YAML regexp without changing financial API authority.

## Why an owner-connected, non-executable checkpoint is necessary

The official recovery branch was issued by a GitHub Actions bot. The automated PR-triggered check attempts reported `action_required` rather than genuine CI success. Its source SHA passed authentic CI [43424219771](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43424219771) and EKODI AI Orchestration Gate [43424219864](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43424219864). After the official recovery branch was synchronized with the current protected main, it advanced to `9564368082a8b814e6a13acbb0f6ae6ff3e1ab38`, so source-SHA check results are **not sufficient** to release the new current HEAD.

This documentation-only commit is an authenticated owner-connected request for real CI on the **official release branch** and the existing protected converge workflow. It changes no JS runtime, deployment flags, authentication, finance SQL, database schema, payment execution, public publishing state or CI policy. It neither approves financial publication nor forges release receipts or status checks. The original source remains an ancestor.

## Verified scope and remaining controls

- Public account-notice UX: stale year response prevention, no false `0원` during load/failure, retry, keyboard tab navigation, clearer annual net-flow wording.
- Shared Site Core canaries: all five independent organization `/accounting` routes must respond with accounting notice content and correct route headers; errors or homepage fallbacks fail the gate.
- Finance API remains separately guarded. The 2026-11-13 external probes reported `401` at `/api/finance/banking/public-summary`, `404` at some organization routes, and homepage fallbacks at others. These are **not resolved merely by this source change**.
- Public bank transaction aggregation must not be enabled without approved site-specific publication scope; personal details, counterparty and account identifiers must remain private.
- Do not merge or promote solely because this checkpoint exists: exact current-head CI, mission/security/tenant tests, orchestrator receipt, overlap review, guarded staging/production release, real-host proof and independent verification still decide.
- No direct main push, production deployment, credential change, bank transfer, invoice issuance or tax filing from this task.

## Completion criteria

On the exact reviewed merged main revision: guarded deploy of Shared Site Core succeeds, all five accounting routes return genuine accounting screens (not site homepages), finance public API returns only explicitly approved aggregate states, authenticated/private API controls retain their protections, keyboard/mobile and empty/error UX are verified in real browsers. Any unavailable approval/credential/service remains an explicit non-success state.

This file is provenance continuity evidence only, not a completion claim.
