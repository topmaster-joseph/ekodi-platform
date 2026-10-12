# LANG-UI-001 — native Chromium release provenance (2026-10-12)

## Authority
- Owner-approved source PR: #4375.
- Exact authorized source SHA: `dbea416341635d08ec5a9ec93ba3345af1c3905a`.
- Owner approval: https://github.com/topmaster-joseph/ekodi-platform/pull/4375#issuecomment-6125609049.
- Official EKODI D1-backed Orchestrator task: `orch_recovery_dbea416341635d08ec5a9ec93ba3345a`.
- Official recovery integration candidate: #4399, branch `ai/chatgpt/orch_recovery_dbea416341635d08ec5a9ec93ba3345a`.
- The recovery workflow created the exact-source branch. Its request to create a GitHub PR was rejected (Actions PR creation HTTP 403); the authorized repository-owner connection opened the identical branch as PR #4399.
- Source PR #4375 was closed unmerged to avoid duplicate conflicts.

## Read-only evidence and limits
- Native Chromium diagnostic runs: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38255816584 and https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38255473539.
- The browser operates headlessly in an ephemeral context, does not reuse real operator credentials, and blocks HTTP mutation.
- Synthetic fixture readiness sequences: 10/10 pass. Multi-locale pill is a synthetic readiness result, **not** proof that a live service published multiple languages.
- Actual live EKODI root and Journal status responses each reported only Korean (`ko-KR`) and hid selector correctly.
- SeonamMedi uses an independently owned Korean-only header; common Shell adoption is unverified.
- `liveCertified=false` is intentional; do not report entire platform completion without real multi-locale positive evidence.
- Native weekly drift workflow begins only on protected main after successful guard-compliant merge; GitHub scheduled runs are neither continuously executing nor evidence of future success.

## Guarded integration
The owner-authored evidence commit on this exact Orchestrator-issued branch starts EKODI `converge-orchestrated-pr-merge.yml` so that the trusted receipt validator, exact-head CI, latest protected main synchronization, conflict review and protected merge are used. This is not authority to bypass security, quotas, reviewer approval or Cloudflare release rules.

## Verification still open
Track independent domain/header ownership and genuine live multi-published service test at https://github.com/topmaster-joseph/ekodi-platform/issues/4365. No synthetic or offline data can fulfill that requirement.

## Owner revalidation after EKODI synchronized protected main

EKODI Convergent Merge run [#38258758832](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38258758832) verified the Orchestrator receipt and returned `action:branch-updated` for PR #4399. The synchronized head was `d8cf5a252b712aa89a68734514b540d9ebecba9d`. GitHub classified the bot-authored merge update as `action_required`, not valid required CI.

This subsequent repository-owner-authored **documentation-only** commit requests fresh GitHub protected PR checks on that latest synchronized tree. It does not waive approval, modify runtime or cloud permissions, falsify checks, or claim a real multi-locale publication. The previous exact-source human approval and D1 Orchestrator receipt remain the unchanged release provenance.

## Protected-main synchronization second pass

Trusted convergence [run #38259031895](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38259031895) returned `action:branch-updated` again after concurrent protected main integration. Exact synchronized workflow-authored SHA: `621010fc383ac76ada5d12be10bf689a89ad2e68`. GitHub labeled the resulting CI `action_required`, not validated. This strictly documentation-only owner-authored follow-up regenerates real required CI for the current head without changing application behavior, weakening review controls, or asserting unverified live language publication.
