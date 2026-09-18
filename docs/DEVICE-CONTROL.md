# EKODI Device Control

## Purpose

Device Control adds a bounded device-management layer to `https://ekodi.kr/admin` without giving the browser arbitrary operating-system authority.

The control path is:

`https://ekodi.kr/admin → internal Control API → Device Control queue → enrolled Windows Agent → verify/result → audit`

The hybrid execution extension keeps the cloud as the control plane and treats enrolled PCs as replaceable execution nodes. An administrator must explicitly enable automatic work on each device. Jobs remain in the cloud queue until an online, enabled device in the requested group has the required capability and spare capacity.

The first release supports Windows only. Android Enterprise and Apple MDM are deliberately deferred because mobile operating systems require managed-device policy channels rather than browser-level system setting changes.

## Security boundaries

- The web UI never executes an arbitrary shell command on a device.
- Cloud commands are limited to a fixed allowlist in `device-control.js` and a matching `switch` in the Windows Agent.
- Device enrollment uses a one-time, 10-minute enrollment code.
- Only SHA-256 hashes of enrollment codes and long-lived device tokens are stored in D1.
- The raw device token is returned once at enrollment and is DPAPI-protected with `LocalMachine` scope on Windows.
- A revoked device token cannot poll or report results.
- Device commands are written to the existing immutable administrator audit trail.
- Auto-logon passwords are never accepted by Device Control, never placed in command payloads, and never stored in EKODI. The Agent only opens Microsoft's Sysinternals Autologon UI on the local PC.
- The Agent does not contain `Invoke-Expression` and reports `arbitraryShell = false`.
- Automatic assignment never expands the command allowlist. It can dispatch only the same bounded commands available to a manually selected device.
- Newly enrolled devices default to automatic execution **off**.
- Laptops, tablets, and other portable chassis are never eligible for automatic work. The Agent reports battery, PC system type, and chassis evidence; the cloud independently requires a confirmed desktop classification before enabling or assigning work.
- Timed-out jobs are reassigned at most three times; queue and result state remain in the cloud database.

## Windows commands

| Command | Behavior |
|---|---|
| `power.always_on` | Disables standby/hibernate; keeps display timeout at 30 min AC / 15 min battery |
| `power.presentation` | Disables standby/hibernate/display timeout |
| `power.normal` | Applies a conservative normal-use timeout profile |
| `power.restore` | Imports the power plan exported before the first EKODI change and activates it |
| `lock.resume_off` | Disables sign-in requirement on resume for AC and battery in the current scheme |
| `lock.resume_on` | Re-enables sign-in requirement on resume |
| `autologon.open` | Opens the local Sysinternals Autologon UI; no password crosses the API |

Before the first power or resume-lock modification, the Agent exports the active Windows power scheme to `%ProgramData%\EKODI\DeviceAgent\power-before-ekodi.pow`.

## Transactional Windows Agent install and upgrade

The Windows Agent install/upgrade path is fail-safe and does not couple Agent availability to desktop-only power features.

- A downloaded Agent candidate is parsed and safety-validated **before** the currently registered Agent is stopped.
- Existing Agent file, configuration, Scheduled Task and `ekodi-device://` protocol state are snapshotted before mutation.
- The candidate is staged under the Agent root and promoted with same-volume file replacement.
- Protocol and Scheduled Task registration are rebuilt only after candidate validation.
- Existing enrollment identity and the DPAPI-protected device token are preserved during upgrade.
- The upgraded Agent is started and a heartbeat is sent before the transaction is considered successful.
- Any failure after the snapshot restores the prior Agent file, Scheduled Task and protocol state and attempts to resume heartbeat.
- Failure output includes a stable `EKA-xxx` stage code; bootstrap failures use `EKB-xxx`.
- The bootstrap elevates with UAC only when the current process is not already elevated.
- Desktop boot-at-startup and Wake-on-LAN are a **separate** operation in `ekodi-device-startup.ps1`. Agent installation never automatically enables Boot/WOL.
- Boot/WOL failures use `EKBW-xxx` stage codes and do not redefine Agent installation success.

The Windows CI regression runs the sequence `candidate validation → existing install upgrade → injected post-replacement failure → rollback → re-upgrade` without touching runner registry/task state.

## Enrollment flow

1. Administrator signs into `https://ekodi.kr/admin`.
2. Open **Devices** and select **Windows PC 등록**.
3. The API returns a one-time enrollment code valid for 10 minutes.
4. Run the generated PowerShell install command once on the target Windows PC.
5. The Agent enrolls, stores its token protected by Windows DPAPI, registers an elevated interactive logon task, starts polling, and verifies heartbeat.
6. The device appears in the admin list with heartbeat state.
7. On a desktop that should resume automatically after Windows startup, apply Boot/WOL separately after Agent health is confirmed.

After initial enrollment, normal power and lock operations are initiated from the admin console.

## Data model

Migrations: `migrations/0021_device_control.sql`, `migrations/0022_device_hybrid_execution.sql`

- `device_enrollments`: short-lived one-time pairing grants
- `device_registry`: device identity, token hash, capabilities, heartbeat, reported settings
- `device_commands`: queued/claimed/completed command ledger
- `device_execution_profiles`: per-device automatic-work switch, group, and concurrency ceiling
- `device_jobs`: central priority queue, assignment, retry, and completion ledger

## Release gates

Do not release directly to production. Before merge/deployment:

1. `npm run check`
2. `npm test`
3. `npm run build`
4. Apply D1 migrations through the guarded Control API deployment workflow.
5. Deploy the Admin site through its guarded workflow.
6. Run the Windows transactional regression: existing install → upgrade → injected failure → rollback → re-upgrade.
7. Enroll or upgrade a disposable Windows test VM/PC and verify the Agent heartbeat resumes before enabling Boot/WOL.
8. Verify all power profiles, resume-lock off/on, and exact `power.restore` behavior.
9. Verify AutoLogon only opens the local Microsoft UI and no password appears in network requests, D1, logs, or audit detail.
10. Revoke the test device and confirm subsequent heartbeat/command polling returns 401.
11. Verify `https://ekodi.kr/admin` shows the upgraded device online with the new Agent version and fresh heartbeat.
12. Apply desktop Boot/WOL separately and confirm a Boot/WOL failure cannot roll back or invalidate a healthy Agent installation.

## Deferred work

- Android Enterprise Device Policy / MDM adapter
- Apple MDM adapter
- tenant-to-device-group authorization policy and time-window scheduling
- cloud-native executor adapters for tasks that do not require a local PC
- agent signed installer/MSIX and automatic agent updates
- local health diagnostics beyond power/lock controls
- remote uninstall with a separate explicit human gate
