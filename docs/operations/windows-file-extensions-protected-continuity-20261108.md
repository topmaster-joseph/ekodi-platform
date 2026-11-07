# Windows file extensions — EKODI protected release continuity

Date: 2026-11-08 (Asia/Seoul)
Task: `orch_recovery_605aad91cb0c0627ef8232843c730fb8`
Source worker PR: #8810, exact source SHA `605aad91cb0c0627ef8232843c730fb8e6af49fc`
EKODI-issued protected release PR: #8842, `ai/codex/orch_recovery_605aad91cb0c0627ef8232843c730fb8`

## Why this owner-connected non-runtime continuation exists

The EKODI Orchestrator created #8842 and synchronized the source with a newer protected `main`. Bot-created pull-request checks on its updated head initially reported `action_required`; these **are not CI pass evidence**. This documentation-only commit requests normal authentic CI on the exact current protected release branch without weakening required checks, changing runtime behavior, bypassing protected merge or assuming production deployment.

The source worker revision passed its own full CI and Device Control Windows CI. These results are **not substituted** for new required checks on the official merge candidate. This continuation does not authorize independent developer merging or direct production deployment.

## Acceptance gates

1. Confirm that the official branch still contains the source SHA and all file-extension UI, API allowlist and Windows Agent 2.6.5 changes; re-sync latest `main` when required.
2. Obtain authentic required `test`, `EKODI AI Orchestration Gate`, device Windows CI and conflict checks on the exact protected release candidate; reject `action_required` and missing statuses.
3. Let EKODI Orchestrator exclusively issue the release receipt, merge and guarded Control API and Site Core deployment, plus any separately governed Agent update.
4. Confirm the actual production `/admin/ops/devices/file-extensions` route, auth/role isolation, mobile/desktop UI, and live online managed Windows Agent `file_extensions.status/show/restore` receipts, restore behavior and audit logs. Code and workflow success alone are not real-device proof.
5. Agent updater references `config/ekodi-device-agent-release.json`; any SHA256-pinned canary rollout requires its own authorized manifest, version/commit/hash checks and positive postrestart heartbeat evidence. Never forge an approved release manifest.

No secrets, credentials, bypass labels, statuses or privileged deployment authority are introduced here.

## Post-sync authentic check request #2

The owner-connected official HEAD `1cbfb1c48bd8fc73ea76d1fb8acfbfc55b3496cb` passed real full CI and Device Control Windows CI. EKODI Orchestrator subsequently synchronized current `main` into the protected branch, producing a new bot-authored head with `action_required` checks. Those checks are **not** equivalent to a test pass. This owner-connected documentation-only continuation requests genuine required checks on the newly synchronized source tree; release remains exclusively EKODI-controlled and blocked until exact current-head evidence exists. No runtime files or security policy are modified by this checkpoint.
