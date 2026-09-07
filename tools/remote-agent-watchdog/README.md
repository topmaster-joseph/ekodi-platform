# EKODI Remote Agent Watchdog v2

Purpose: keep an already-paired Remote Desktop Commander device agent online after reboots and transient crashes without storing a Windows password in EKODI or GitHub.

## Why v2 exists
Remote Desktop Commander is not a permanent Windows GUI executable. The supported remote device is started with:

```powershell
npx @wonderwhy-er/desktop-commander@latest remote
```

The connection exists only while that agent process is running. The previous watchdog looked for `DesktopCommander.exe` and launched the task as `SYSTEM`; that can miss the actual remote process and the paired user's device credentials.

## v2 recovery chain
1. The device is paired once by the real Windows user.
2. Installer verifies Node.js/npx and `%USERPROFILE%\.desktop-commander-device\device.json`.
3. A Windows Scheduled Task runs as that paired user with `S4U`, so no Windows password is stored in the repository or control plane.
4. `watchdog.ps1` launches the real `npx ... remote` device agent.
5. If the agent exits, the supervisor restarts it with exponential backoff from 10 seconds up to 5 minutes.
6. The task is configured for startup/logon, unlimited runtime, duplicate-instance suppression, and Task Scheduler restart-on-failure.
7. `verify-watchdog.ps1` reports Node/npx, pairing, task state, remote process count, and recent logs as JSON.

## One-time installation
First, pair the target PC interactively as the Windows user who should own the remote session:

```powershell
npx @wonderwhy-er/desktop-commander@latest remote
```

Approve the device in the browser and confirm it reaches `Device ready`. Then open an elevated PowerShell from this folder and run:

```powershell
.\install-watchdog.ps1
```

To install for a specific local/domain user:

```powershell
.\install-watchdog.ps1 -AgentUser 'COMPUTER\username'
```

## Verification

```powershell
.\verify-watchdog.ps1
```

Exit code `0` means the local prerequisites, scheduled task, and remote-agent process are all present. Logs are stored under `%ProgramData%\EKODI`.

## Security
- No Windows administrator password is committed or sent to EKODI Admin.
- The scheduled task runs as the paired user, not `SYSTEM`.
- Device authorization remains the Remote Desktop Commander OAuth device flow.
- Local commands retain that Windows user's permissions.
- Crash loops are slowed with bounded exponential backoff.
- Removal remains reversible with `uninstall-watchdog.ps1`.

## Important scope
This watchdog improves the reliability of the fallback remote-control channel. It does not make Remote Desktop Commander or Opera Browser Connector the primary EKODI automation engine. Stable production automation should prefer direct APIs/server workers first, headless browser workers second, and interactive remote-control connectors only for exceptions, recovery, or human-visible verification.
