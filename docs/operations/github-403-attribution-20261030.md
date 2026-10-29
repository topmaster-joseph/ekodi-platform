# EKODI GitHub 403 diagnostic contract (issue #6630)

The same authenticated HTTP 403 has blocked required status publication and protected PR convergence. The prior logs could not distinguish exhausted installation quota from missing GitHub App permission.

This change captures only measured REST quota response headers and a strictly allowlisted classification. Raw response bodies, credentials, URLs, response headers, actors and email are never emitted. A missing header stays unknown, not a fabricated quota number. 401, 403, 429 and 422 fail immediately; transient 5xx retry remains bounded at two attempts.

Changes: scripts/github-http-diagnostic.mjs, scripts/github-status-transient.sh, scripts/converge-orchestrated-pr-merge.mjs and tests. No workflow status context, exact-head SHA, authentication, branch protection, user authorization, production credential, GitHub merge, scheduler or deployment behavior is relaxed.

Validate: node --test test/github-http-diagnostic.test.mjs test/github-status-transient-retry.test.mjs; plus the official exact-head checks. The real response status/headers are required to classify the source of GitHub 403; tests do not prove quota exhaustion. The official EKODI Orchestrator recovery PR #6886 remains separate and must pass its own required CI before protected merge and guarded D1 release. Signed GitHub App event delivery and cross-run quota reservation remain unverified.
