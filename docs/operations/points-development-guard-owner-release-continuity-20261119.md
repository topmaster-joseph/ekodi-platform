# EKODI Points — protected owner-only DEVELOPMENT guard release continuity

Date: 2026-11-19 KST. Central issues #7778 and #6739.
Source worker PR #9935, source functional SHA `c957921ead09b7c684022f32b7176b2fe9d06307`.
First-party EKODI Orchestrator official recovery PR #9936, initial branch `ai/chatgpt/orch_recovery_c957921ead09b7c684022f32b7176b2f`.
This record is release provenance, **not** schema deployment authorization or proof of execution.

## Why this workflow is necessary

The read-only Points readiness preflight was strengthened by protected merge #9882, but direct 2026-11-19 Supabase DEVELOPMENT inspection still proved:
- 20 prior Points migrations present, final `20261108224500_ekodi_points_nonverified_reward_guard.sql` receipt missing
- both `ekodi_points_no_unverified_active_credit` and `ekodi_points_no_devotion_self_report_credit` CHECKs missing
- ledger rows 0, wallet balance aggregate 0, enabled browser heartbeat rules 0, enabled devotion self-report adapters 0

Latest Points member/admin browser E2E [44505863401](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/44505863401) fails on **partial** protected Cloudflare Access identity; latest backup membership [44287724542](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/44287724542) fails without owner-protected production `EKODI_STORAGE_GATEWAY_KEY`. These are independent unresolved gates; do not bypass or claim real browser / backup success.

## Implemented source scope

The new `.github/workflows/deploy-points-nonverified-development-guard.yml` is **workflow_dispatch-only**. It requires the GitHub owner `topmaster-joseph` acting directly, explicit owner-approval input, a current exact immutable `main` SHA, a matching issued `ai/.../orch_...` release receipt validated through the official EKODI AI release gate, and existing protected GitHub `development` environment credentials. It cannot target the production Supabase project.

The SQL is precisely the pre-existing source migration locked by Git blob SHA `17a1003aa5968c4a7a4914684a144abf5b462ce6`. The workflow independently checks 20 old migration receipts, absence of partial guards or currently-enabled unverified rewards, zero DEVELOPMENT ledger/wallet value, and no leftover synthetic sites. It rechecks protected main before any mutation, then would run **one atomic transaction** containing only those two existing CHECK constraints and their migration-history receipt. There is **no automatic retry** of an ambiguous mutation. The readonly postflight must prove both CHECKs are validated, canonical, recorded and issued zero credit.

The preflight SQL was actually executed read-only against the fixed DEVELOPMENT DB: **all nine preflight booleans TRUE**. The postflight SQL was actually executed read-only before changes: both guards and migration receipt FALSE, with unchanged zero economic value. The workflow has **not** been dispatched, and no SQL is applied.

## Validation and protected authority

The original PR had genuine static security, Cloudflare boundary, Supabase Local CI, Constitution and zero-subdomain success; full source CI still needs confirmation on the exact source SHA. GitHub's first-party-generated recovery branch can display `action_required` for bot-generated PR checks without executing them; this non-executable documentation-only update on the official recovery branch asks for genuine source-connected check execution on the current official head. It does not grant authority to execute the workflow, forge a receipt, alter branch protection or skip approval. The official Orchestrator owns any rebase, merge and release.

After protected merge, **the owner must choose to run** the DEVELOPMENT-only workflow through GitHub Actions and supply its exact current main SHA and an existing official release receipt. If that owner action is absent, say **deployment path prepared** rather than **schema applied**.

Separate production backup+restore proofs, DEV member/admin browser E2E and owner/legal/security/finance approval must all pass before any economic Points activation. `POINTS_ENABLED=false` remains mandatory.
