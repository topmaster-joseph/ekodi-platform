# EKODI Device Control

## Purpose

Device Control adds a bounded device-management layer to `admin.ekodi.kr` without giving the browser arbitrary operating-system authority.

The control path is:

`admin.ekodi.kr → api.ekodi.kr → Device Control queue → enrolled Windows Agent → verify/result → audit`

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

## Enrollment flow

1. Administrator signs into `admin.ekodi.kr`.
2. Open **Devices** and select **Windows PC 등록**.
3. The API returns a one-time enrollment code valid for 10 minutes.
4. Run the generated PowerShell install command once on the target Windows PC.
5. The Agent enrolls, stores its token protected by Windows DPAPI, registers an elevated interactive logon task, and starts polling.
6. The device appears in the admin list with heartbeat state.

After initial enrollment, normal power and lock operations are initiated from the admin console.

## Data model

Migration: `migrations/0021_device_control.sql`

- `device_enrollments`: short-lived one-time pairing grants
- `device_registry`: device identity, token hash, capabilities, heartbeat, reported settings
- `device_commands`: queued/claimed/completed command ledger

## Release gates

Do not release directly to production. Before merge/deployment:

1. `npm run check`
2. `npm test`
3. `npm run build`
4. Apply D1 migrations through the guarded Control API deployment workflow.
5. Deploy the Admin site through its guarded workflow.
6. Enroll a disposable Windows test VM/PC.
7. Verify all power profiles, resume-lock off/on, and exact `power.restore` behavior.
8. Verify AutoLogon only opens the local Microsoft UI and no password appears in network requests, D1, logs, or audit detail.
9. Revoke the test device and confirm subsequent heartbeat/command polling returns 401.
10. Verify `admin.ekodi.kr` shows the resulting device state and command result.

## Deferred work

- Android Enterprise Device Policy / MDM adapter
- Apple MDM adapter
- device groups and policy scheduling
- agent signed installer/MSIX and automatic agent updates
- local health diagnostics beyond power/lock controls
- remote uninstall with a separate explicit human gate
