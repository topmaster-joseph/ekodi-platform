# EKODI Execution Fallback Policy

Status: mandatory execution rule for AI-operated development work.

## Rule
A temporary failure, quota exhaustion, unavailable remote PC, connector outage, or provider limit MUST NOT terminate an otherwise authorized EKODI task.

1. Preserve the current task as incomplete and record a checkpoint.
2. Immediately try an authorized provider-independent path that can preserve the central gate. Preferred order: repository-native GitHub branch/PR/workflow path; available isolated cloud runner; connected authorized execution node; deferred resume from checkpoint.
3. Never bypass branch isolation, review, tests, guarded deployment, secrets policy, or production verification merely to work around a tool outage.
4. Do not mutate production directly as a fallback.
5. A fallback worker must use the same task identity or an auditable continuation identity and record branch, commit, validation, deployment and verification evidence.
6. If source ownership or the exact implementation surface cannot be established from authoritative repository/runtime evidence, do not guess. Create or update the checkpoint and continue discovery through authorized sources.
7. Completion language is forbidden until canonical production verification passes. HTTP success, a commit, PR, merge or deployment alone is not completion.
8. Once the unavailable primary executor returns, it may resume only from the latest authoritative checkpoint; it must not repeat or overwrite accepted work.

This policy complements AI_DEVELOPMENT_POLICY.md, AGENTS.override.md, the central merge/release gate, and AI claim-integrity rules. Where any conflict exists, the stricter existing governance rule wins.
