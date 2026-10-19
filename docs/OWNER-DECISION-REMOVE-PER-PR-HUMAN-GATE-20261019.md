# Owner decision: remove the per-PR human approval comment (2026-10-19)

- Decided by: topmaster-joseph (Owner), in the Claude session of 2026-10-19 12:46 KST, after the trade-offs were presented ("승인 검사 삭제").
- Removed: the `EKODI-HUMAN-GATE-APPROVE:<sha>` comment + `orchestrator-human-gate-approved` label requirement in `recover-release-provenance`.
- Kept: exact-SHA required CI (`test`, `EKODI AI Orchestration Gate`) before any merge, protected-branch convergence, guarded deploy workflows (staging, reliability and native verification gates), production verification, rollback. Draft PRs never release.
- Recorded evidence: every recovery task stores `owner-removed-per-pr-human-gate-20261019` as its delegation; a legacy approval comment, if present, is still recorded as exact-SHA human approval.
- Known consequence (accepted by the Owner): any non-draft `ai/*` PR from this repository, from any AI worker, can reach production once CI is green.
- Reversal: restore the label condition in `.github/workflows/recover-release-provenance.yml` and the waiting branches in `scripts/recover-release-provenance.mjs`.
