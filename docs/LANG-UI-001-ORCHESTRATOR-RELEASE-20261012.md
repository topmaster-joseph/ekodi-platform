# LANG-UI-001 — official Orchestrator release evidence (2026-10-12)

## Provenance
- Original approved source: PR #4328, commit `c4324b166a74726d2edc0890f336b8fb3e58d999`.
- Owner Human Gate: https://github.com/topmaster-joseph/ekodi-platform/pull/4328#issuecomment-6123445623
- EKODI-issued task: `orch_recovery_c4324b166a74726d2edc0890f336b8fb`.
- Issued integration branch: `ai/chatgpt/orch_recovery_c4324b166a74726d2edc0890f336b8fb`.
- Sole integration candidate: PR #4354.
- Original PR #4328 closed without merge after exact-source migration.
- Authoritative recovery run: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38243548962
- GitHub Actions' PR creation was denied HTTP 403; authenticated repository-owner connector opened PR #4354 using the identical issued branch. This does not change the official release authority.

## Source acceptance
- LANG-UI-001: first paint keeps language selector hidden until readiness resolves.
- Exactly one published language or failed/malformed readiness hides selector without an empty header gap.
- Two or more validated published locales expose the rounded shared header control.
- Periodic readiness recovery restores a published-language selector, with no footer duplicate.
- HTTP 429 remains fail-closed, with no traffic-limit bypass or extra retry.
- Source CI: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38247338954
- Shell staging: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38247338541
- Control API staging: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38247339162
- Shared UI validation: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38247339177

## Protected-base convergence
The repository requires the PR branch to be current with protected `main` and expects `test` plus `EKODI AI Orchestration Gate` statuses on the current merge candidate. Other merges advanced `main` after the approved source head. The official EKODI-owned `converge-orchestrated-pr-merge.yml` workflow owns base synchronization, fresh required checks, guarded merge and post-merge Shell deploy dispatch.

This documentation-only owner-authored commit requests that workflow through the already issued integration branch. It must **not** waive checks, directly mutate production, or claim a successful release merely because a run was dispatched. A generated GitHub Actions merge SHA or Cloudflare Access-protected staging result is not independent live-production acceptance.

## Production acceptance still required
1. Protected PR #4354 merged under its real orchestrator task and successful required CI.
2. EKODI Shell production deployment with verified commit/release receipt.
3. Real public-page DOM and API check: single-locale hidden, two or more published locales rounded visible, initial hidden state, outage fail-closed, recovery and no footer selector.
4. Cloudflare 429 remains a stop condition; an inconclusive check is not success.

## Owner revalidation after protected-base synchronization

- The first official Convergent Merge run [#38248346376](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38248346376) returned `action: branch-updated` and synchronized this PR branch to protected `main`.
- The synchronized head `71f326d24de9502f0b076671b795b1d6eeaebe49` was generated through the trusted workflow but GitHub classified its pull-request jobs as `action_required`, not successful.
- This subsequent owner-authored documentation-only update deliberately triggers fresh required PR CI on the synchronized source tree, without waiving those checks, altering release settings, or changing application code.
- The official Orchestrator task identity remains unchanged, and production claims still require the actual protected merge plus live rollout receipt.
