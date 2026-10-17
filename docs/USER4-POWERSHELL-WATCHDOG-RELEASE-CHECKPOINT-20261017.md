# USER4 PowerShell window — governed recovery checkpoint (2026-10-17)

## Source and authority
- Original owner-approved source PR: #5186.
- Source commit exact SHA: `73266af1640bb38f178d84d730ce723e4a774c21`.
- Authorized recovery task: `orch_recovery_73266af1640bb38f178d84d730ce723e`.
- Official recovery PR: #5192, branch `ai/chatgpt/orch_recovery_73266af1640bb38f178d84d730ce723e`.
- Owner's exact-SHA approval comment was registered before its `orchestrator-human-gate-approved` label.

## Diagnostic boundary
USER4 owner-provided screenshot displayed `powershell.exe` as a brief visible console on the user desktop. The parent process, the scheduled task and the launch command were *not observed*, and therefore the Remote Agent Watchdog remains a candidate cause, not a confirmed cause. Remote Desktop Commander reported USER4 offline and rejected remote shell inspection owing to usage quota. Never claim the popup is fixed based only on GitHub source and workflow results.

## Source change (unchanged by this checkpoint)
The authorized proposal retains the watchdog's SYSTEM-only Scheduled Tasks, 2-minute monitoring and bounded restarts. The startup and monitor actions launch `powershell.exe` with `-NonInteractive -WindowStyle Hidden`. JSON state parsing no longer depends on unsupported Windows PowerShell 5.1 `ConvertFrom-Json -AsHashtable`. CI must validate Windows syntax and source contracts.

## Why this documentation-only owner-authored commit is needed
The trusted EKODI provenance workflow created the recovery PR using GitHub Actions credentials, which caused its initial pull-request-triggered checks to report `action_required` **without running jobs**. This documentation-only owner commit requests real GitHub Actions CI and allows the official protected convergent merge workflow to evaluate the latest head. No runtime, credential, authorization, payment, data, production configuration or branch governance code is altered here. Do not substitute the previous source PR's successful checks for fresh recovery-branch checks.

## Completion requirements
1. Verify current main ancestry, exact task/branch release receipt, mandatory authentic checks, conflict guard and human authorization through official EKODI Orchestrator; no protection bypass.
2. A successful protected merge alone does not install the change on an already registered USER4 scheduled task. A controlled authorized reinstall/update of the watchdog scheduled task must be performed on USER4 if that task is verified as the cause.
3. Preserve Windows logging and watch process parent IDs / scheduler task history. Do not suppress unrelated suspicious processes.
4. On the real USER4 desktop verify no stray console, uninterrupted application focus, heartbeat continuity, successful watchdog recovery and no user tab/clipboard interference across multiple task intervals; record timestamps and evidence.
5. Report any unavailable live user-device proof as pending; do not claim deployed or fixed until verified.
