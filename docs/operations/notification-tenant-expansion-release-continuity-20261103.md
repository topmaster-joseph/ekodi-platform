# EKODI notification tenant expansion — release continuity

The feature source was reviewed as PR #7843. Its immutable source SHA is a1df83a220ff6f949e6ac7454d7bf1a5c4160fd6. The EKODI Orchestrator issued official recovery PR #7845 for task orch_recovery_a1df83a220ff6f949e6ac7454d7bf1a5. The source PR was superseded and was not directly merged.

The official recovery branch currently awaits authentic required CI checks. This documentation-only change requests fresh first-party checks on the existing recovery branch. It does not change runtime behavior, release authority, workflows, access grants or notification delivery settings.

Source verification: 24 notification and admin tests passed. The full build, 220 additive D1 migrations and service-layer checks passed. The newly verified tenant/site pairs are cheonggye/cgma and ekodimall/mall, while the existing church/mission pairs remain protected.

Completion requires official protected convergence, successful service-specific deployment, and production validation of anonymous access denial, scope separation, tenant admin settings pages, and unchanged notification consent. Do not treat this note or a green build as a release receipt.
