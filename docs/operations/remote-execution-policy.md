# EKODI Remote Execution Policy

## Decision
Opera Browser Connector and Remote Desktop Commander are fallback control channels, not the production automation runtime.

## Execution priority
1. **Direct API / server worker**: preferred for Google, GitHub, Supabase, mail, publishing, uploads, scheduling, and other systems with stable APIs.
2. **Dedicated browser worker**: use Playwright/Chromium on an always-on EKODI worker only when no usable API exists. Browser state belongs to the worker, not to a person's daily browser session.
3. **Remote Desktop Commander**: use for local-file work, recovery, deployment bootstrap, diagnostics, and exceptional machine-specific tasks.
4. **Opera Browser Connector**: use for human-visible inspection, reading open tabs, screenshots, and navigation assistance. Do not make an automation depend on an Opera tab remaining connected.
5. **Manual action**: last resort for security approvals, MFA, device pairing, captchas, or provider flows that intentionally require a person.

## Reliability rules
- A production workflow must not fail merely because Opera is closed, a browser tab changed, or a user's PC slept.
- Any PC-dependent worker must expose a heartbeat and a last-seen timestamp to the EKODI control plane.
- Long-running local agents must start automatically after reboot and self-recover after process exit.
- Workflows must be idempotent or checkpointed so a restarted worker can resume safely.
- Each job must declare its executor class: `api`, `browser-worker`, `remote-pc`, or `manual`.
- The scheduler must prefer `api`, then `browser-worker`, and route to `remote-pc` only when required.
- Personal notebooks are not production worker nodes.

## Browser-worker baseline
A dedicated worker should run Chromium/Playwright under its own service account and persistent profile, with secrets supplied from the server-side secret store. It should have:
- process supervisor / auto restart;
- health endpoint and heartbeat;
- per-job timeout and retry budget;
- screenshots and structured logs on failure;
- persistent download/upload workspace;
- explicit domain allowlist;
- isolated profiles per service when session separation is required.

## Remote PC baseline
Remote Desktop Commander remains useful because it can reach local files and terminals. Every authorized remote PC should have:
- the paired user device config;
- Node.js 18+ and `npx`;
- EKODI Remote Agent Watchdog v2;
- power policy that avoids unintended sleep for designated worker devices;
- Wake-on-LAN only where hardware/network support is verified;
- a clear `worker` or `personal` role in the control plane.

## Opera baseline
Opera Browser Connector is an observation and navigation surface. A connected Opera session may be convenient, but it is ephemeral by nature and must not be a single point of failure.

## Migration rule
Whenever a recurring task succeeds twice through Remote Desktop Commander or Opera, review whether it can be promoted upward to a direct API or dedicated browser-worker implementation. Repetition is a signal to remove interactive dependencies.
