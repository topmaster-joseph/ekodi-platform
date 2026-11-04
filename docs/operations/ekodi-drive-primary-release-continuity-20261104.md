# EKODI Workspace primary Drive — official release continuity

2026-11-04 KST. User-approved enterprise storage separation; task `storage-joseph-workspace-primary-20261104`.

## Official immutable lineage
- Original worker source PR #8166, functional commit `6472cb4e74e0d0832c6ae055a0bba736c045b426`, closed without direct merge.
- First-party EKODI Orchestrator recovery PR #8167, official branch `ai/chatgpt/orch_recovery_6472cb4e74e0d0832c6ae055a0bba736`.
- Source commit passed real CI, Supabase Local CI, EKODI AI Orchestration Gate, Validate Admin Storage Workspace, Storage and External AI Contracts. The recovery branch retains the exact functional ancestor and is at current main.
- This owner-connected **documentation-only** continuation requests authentic latest-head GitHub checks where bot-generated recovery events report `action_required`; it does NOT merge the worker PR, forge release status, override the orchestrator or deploy from this workspace.

## Storage identity and safety evidence
- Canonical EKODI Workspace Shared Drive ID `0ACM_FnMYWMFuUk9PVA` was already in source and has been preserved; no duplicate Drive was created.
- Primary service account must be the actual OAuth-authenticated `joseph@ekodi.kr` email, not the separately linked personal `topmaster.joseph@gmail.com`. OAuth callback rejects an incorrect primary email before disabling an existing connection, and chooses Workspace login hint. Admin storage status exposes mismatch instead of silently declaring success.
- Connected ChatGPT Drive for file discovery was still authenticated as the personal Google account; the separately connected EKODI Gmail provider has verified the existence of `joseph@ekodi.kr` but does NOT grant Google Drive Manager rights or Drive OAuth on its behalf.
- Sixteen church voice/video assets (eight MP3, eight MP4) were copied from personal My Drive into the canonical Shared Drive's `02_CHURCH/261011_주일예배_오디오`, including the video subfolder. Names and sizes were independently re-listed and matched 16/16; originals remain intact. File content-hash and Workspace Manager-perspective read checks remain open.
- Seventeen merchant/trademark assets include a private original-AI subfolder; they remain untouched pending manager membership and least-privilege tenant access verification. No private file was broadly shared.
- Canonical `99_BACKUP/SUPABASE_PROD` subfolder structure exists, but it contains no exported production Supabase database. Existing backup/PITR gate remains unchanged.

## Release and provider gates
1. EKODI protected recovery CI/merge/deploy verifies all current-main ancestry, tests and exact branch release receipt.
2. The real production storage status/admin must show the exact Workspace principal and correct shared drive ID. This cannot be asserted from a source commit or from the ChatGPT personal-account connector.
3. The Workspace owner must connect `joseph@ekodi.kr` to **Google Drive**, grant/verify Manager role on EKODI Shared Drive, and confirm account-specific storage routes. Google Drive OAuth remains a distinct user-provider action. No AI bypass.
4. After verifying Drive Manager membership and folder access rules, complete the 17 restricted merchant document transfers with per-file count/size/integrity and link-usage checks. Do not delete personal originals without a separate reversible verified cleanup decision.
5. Production canary verifies admin warning/match UI, actual canonical storage writes only under the approved organization principal, and no cross-tenant data leaks. Only then record scoped completion.

This file is not an authority to make the personal account a Workspace organizer, bypass privacy gates, or report migration finished.

## Required checks after orchestrator synchronization
The first owner-connected official recovery documentation HEAD `76a1dbc67539b90d7dd533970395cd55ca39a9d7` passed authentic CI, Supabase Local CI, orchestration, Storage Control deployment validation, and Admin Storage contracts. Concurrent platform merges subsequently synchronized the recovery branch to bot HEAD `c3d8dd3679bcc0201c6226459cd87d46d63783c5`, preserving the original functional source ancestor. Bot-generated `action_required` statuses do not count as passed CI. This non-runtime documentation addition requests authenticated checks again; it does not merge, deploy, alter member access, or remove any personal-account files.
