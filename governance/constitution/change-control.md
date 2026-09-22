# Change Constitution
C0 operational: automated checks may apply.
C1 compatible implementation: CI required.
C2 constitutional/topology/source-of-truth: explicit owner confirmation + amendment + version bump + rollback.
C3 breaking architecture/security/data: C2 plus migration, staged rollout and rollback proof.
Protected constitutional changes must never ride silently inside unrelated changes.

## Required status-check recovery
A protected-branch check block is never resolved by bypassing or weakening protection. The orchestrator diagnoses actionable failures, repairs them, reruns/retriggers checks, refreshes stale branches when needed, and retries merge only after required checks pass. Waiting is terminal only while an external check/deployment is actively queued or running or a preserved human gate is required.
