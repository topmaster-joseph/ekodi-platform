# EKODI notification site-scope release continuity

Source PR: #7833
Source commit: 033a32abbe4bab5cc2ff021e064c3a10c8f86ff2
Official EKODI recovery PR: #7834
Orchestrator task: orch_recovery_033a32abbe4bab5cc2ff021e064c3a10

This documentation-only continuity change records the existing official release path. The original task PR remains superseded, and protected CI, the release receipt, guarded merge, staging, deployment, and production verification remain required.

The source passed twenty targeted tests, full build, D1 additive migration checks, and service boundary checks. The change adds read-only per-site notification statistics with verified church and mission workspace contexts. The global administrative view keeps its existing access control. No sending configuration changes are included.

Operator validation: review the exact deployed Worker version, anonymous access denial, authenticated site isolation, and desktop/mobile site service settings. Continue to block cross-site information and do not report completion from build results alone.
