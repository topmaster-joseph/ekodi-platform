# EKODI Remote Agent Watchdog

Purpose: keep the authorized Remote Desktop Commander agent online without storing Windows administrator passwords in the cloud.

## Recovery chain
1. PC is off: EKODI Admin sends Wake-on-LAN through the LAN relay.
2. Windows boots: the watchdog scheduled task starts under SYSTEM.
3. Agent is missing: watchdog restarts the configured executable.
4. Agent stays missing: watchdog retries every 2 minutes, capped at 6 restarts per hour.
5. Agent returns: normal Remote Desktop Commander connectivity resumes.

## Install
Run an elevated PowerShell from this folder:

```powershell
.\install-watchdog.ps1 -ProcessName 'DesktopCommander' -ExecutablePath 'C:\Path\To\DesktopCommander.exe'
```

If `ExecutablePath` is omitted, the watchdog tries common installation paths. For production, an explicit path is preferred.

## Security
- No Windows password or interactive-login secret is stored in EKODI Admin or GitHub.
- The watchdog can only start the configured executable. It does not expose a generic remote shell.
- Restart attempts are rate-limited to prevent crash loops.
- State and logs stay under `%ProgramData%\EKODI` on the device.
- Removal is reversible with `uninstall-watchdog.ps1`.

## Deployment prerequisite
The first installation must occur while the PC is online or through another authorized local management channel. After installation, routine agent crashes and post-reboot recovery are automatic.
