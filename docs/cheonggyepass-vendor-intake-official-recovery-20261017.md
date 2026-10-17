# Cheonggye Pass vendor intake — official EKODI recovery record (2026-10-17)

This is a documentation-only CI re-trigger on the first-party EKODI Orchestrator branch. It changes **no** application logic, database schema, authorization, storage, deployment guard, or executable test.

- Approved feature PR: [#5159](https://github.com/topmaster-joseph/ekodi-platform/pull/5159).
- Immutable approved source SHA: `8a4c87c9b88e0c79864f98fc2bdbe02f9c9818b6`.
- Authenticated owner approval: [exact-SHA GitHub marker](https://github.com/topmaster-joseph/ekodi-platform/pull/5159#issuecomment-6233214016); `orchestrator-human-gate-approved` applied **after** comment.
- Official task: `orch_recovery_8a4c87c9b88e0c79864f98fc2bdbe02f`.
- Issued branch: `ai/gpt6/orch_recovery_8a4c87c9b88e0c79864f98fc2bdbe02f`.
- Protected recovery PR: [#5168](https://github.com/topmaster-joseph/ekodi-platform/pull/5168).
- Rebased by a conflict-free **merge commit** `f6112d859ff19131cc04995f6b5bbe2276079d44` preserving both the approved source and the latest main `22626bba3f68a2338e93986faacda19a83ff9d8e` as ancestry.

## Non-negotiable guardrails

1. Run genuine GitHub Actions checks on the current official branch HEAD. A previous `action_required` check is **not** a pass.
2. Recheck main ancestry and merge conflicts, require all protected status checks and proper GitHub owner approvals; no force push or bypass.
3. The ZIP path only quarantines untrusted source. No automatic extraction, malware scan claim, arbitrary execution, or direct deployment.
4. API provider URLs are registered as metadata and **never fetched** during intake; SSRF blocking must remain active.
5. Before enabling ZIP intake, the private R2 bucket `ekodi-pass-vendor-quarantine` must really exist and the Control API binding must be verified.
6. Apply additive D1 migration `0151_cheonggyepass_vendor_intake.sql` through the guarded Control API workflow only.
7. Deploy shared Site Core and Control API only with orchestrator receipt, staging checks, rollback protection, and real PC/mobile administrator login/role tests.
8. Do not claim service completion without exact production evidence and authenticated functional proof.

This document only triggers authentic checks and records safeguards; it does **not** approve executable modifications beyond the earlier exact source SHA.

## Latest protected branch synchronization

GitHub updated the official recovery branch with current protected main via merge commit `b5570ac3856ef1114201c76132ba635e9e8f6623` (parents `c0e19f1ce96824f8fba7b5ce2a4db49d91af6e5e` and `e8144c70a31a1c7c89990976a500a0e4ec8f3342`). This no-code document revision regenerates authentic CI for that updated source; the exact SHA user approval remains anchored to the original source ancestor.
