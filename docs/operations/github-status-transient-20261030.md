# EKODI GitHub status API transient-failure guard — issue #6630

Actual evidence: CI workflow #40811332004 on official recovery PR #6684 passed feature regression tests but failed required legacy-status publication when GitHub responded HTTP **502 Server Error**. This is not proof of a quota 403/429 event. The failed run remains a failure; no state was fabricated.

The shared Bash helper `scripts/github-status-transient.sh` is sourced only in CI and EKODI AI Orchestration Gate's legacy status publishing steps and CI late failure revocation. It preserves authentic head and **live merge-SHA** provenance and all branch protections. A 500, 502, 503, 504 or connection 000 may retry at most twice, with short bounded delays. Authentication, permission and quota errors 401/403/429 and policy 422 never retry, and terminal failures are always nonzero. Secrets and GitHub JSON response bodies are not logged. No GitHub status is marked green unless the existing authoritative job succeeded.

Local deterministic tests `node --test test/github-status-transient-retry.test.mjs test/required-status-check-uniqueness.test.mjs test/merge-queue-required-check-readiness.test.mjs` and protected exact-head CI are required, then official EKODI Orchestrator protected merge. No production migration, DNS, paid API or release bypass in this patch. The GitHub App Webhook enablement and cross-installation budget queue remain open under #6630.

## Authentic exact-head EKODI recovery checks

The EKODI Orchestrator generated official recovery PR #6852 for issue #6630. Source CI run #40910573127 passed; the original PR head changed after protected-main synchronization. This author-owned documentation update triggers authentic CI and Orchestration Gate on the newest recovery SHA. Required checks and protected merging are not skipped. No production secret is created or released here.
