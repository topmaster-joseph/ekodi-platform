# Control API runtime release dispatch — protected recovery checkpoint (2026-10-18)

## Immutable Human Gate
- Source PR #5232 owner-approved functional HEAD: `8da0d3413fbd80fd0d9ca210e68137b5ecdd896e`.
- Owner exact-SHA comment: https://github.com/topmaster-joseph/ekodi-platform/pull/5232#issuecomment-6243153085
- The `orchestrator-human-gate-approved` label followed the owner comment; no inherited approval.
- First-party D1-backed task: `orch_recovery_8da0d3413fbd80fd0d9ca210e68137b5`.
- Official release PR #5234 branch `ai/gpt6/orch_recovery_8da0d3413fbd80fd0d9ca210e68137b5`.

## Native CI restart
Recovery PR #5234 was automatically issued but initial protection could not proceed because the latest main was not in the original source ancestry. This owner-authored **documentation-only** commit triggers authentic GitHub pull-request CI and permits the first-party protected converger to synchronize from current main. It does not change executable source, security policy, deployment scripts, data, secrets or permissions. The approved source commit must remain in ancestry. Do not fabricate required statuses or merge without source receipt and passing guards.

## Production blocker discovered independently
The prior Shared Site Core deploy run https://github.com/topmaster-joseph/ekodi-platform/actions/runs/39057779001 failed because `deploy/manifests/shared-site.worker.json` still required the deleted `/api/control/ai/v8/pulse` marker in `/control.js`; after failed verification, rollback verification at `/pay` also failed. This is a **separate operational release blocker**. Do not claim live Control UI is fixed until the manifest is repaired in its own exact-approved guarded change, the Site Core deploy succeeds, rollback health is verified, and actual Google super-admin session and PC/mobile commands are tested.

## Scope of this recovery
PR #5234 only wires `ai-orchestrator-runtime.js` to the receipt-bound Control API deploy selector and adds a regression test. No direct deployment or privilege elevation is authorized. After source provenance, CI, protection and merge, Control API staged and production outcomes must be independently checked.

## Synchronized-main authentic CI checkpoint
The first-party protected converger advanced official release PR #5234 to merged-main synchronization commit `2401a87c192d29009047cfd4e59866ca69b033be` (base `bad0e6b92669ecfa67e032b5541ad1992bce3ce7`). GitHub ancestry proves original exact-approved executable SHA `8da0d3413fbd80fd0d9ca210e68137b5ecdd896e` remains a strict ancestor. Bot-authored synchronization did not produce authentic required check runs. This owner-authored **documentation-only** update requests native PR checks; it must not alter deployment scripts, privileges, production data or bypass separate Shared Site Core blocker PR #5237. Production success is still unverified.
