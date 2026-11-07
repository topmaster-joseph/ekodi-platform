# EKODI AI family native user-mode runner — Phase 4

Source task: #8621. Parent: #7796. Previous protected recovery: #8607.

## Scope and deliberately disabled defaults

This is a reusable **user-process runtime library**, NOT an installed/registered Windows service or operational execution node. It does not create a Windows Scheduled Task, login to a provider, open browser sessions, copy tokens, mutate `main`, deploy, or enable `AI_ROUTE_FAMILY_AUTO_DISPATCH`. The flag remains false. Code and fake-process tests are not evidence of a live authenticated CLI response.

The existing EKODI Windows Device Agent is an elevated Scheduled Task. **Do not wire its privileged command handler directly to user-writable Codex/Claude Code scripts.** Native CLI execution must be hosted separately in the interactive user's non-elevated Windows session, with an independently scoped credential, audited one-job consent, and a trusted signature-verifying local broker.

## What is implemented in this tranche

- `ai-family-native-runner.mjs`: a shell-free, fixed allowlisted `node.exe` CLI invocation. Rejects unsupported OS, duplicate/rate-limited jobs, untrusted broker, missing non-elevated Windows identity, absent signed one-job consent, wrong device/request key, binary SHA256 mismatch, missing subscription OAuth proof, expired lease, or API metering.
- Executes stdin prompt with minimum environment and no API/device keys; never logs stderr or auth tokens. Uses an authenticated, injected heartbeat callback before execution, throughout execution, and after completion; stops on loss of lease, timeout, abort, or oversized output. Returns bounded receipt only after successful CLI exit and fresh lease.
- `ai-family-windows-preflight.mjs`: fixed PowerShell WindowsPrincipal non-admin interactive-token probe; subscription-only read-only CLI auth-status probe; fixed `taskkill.exe /PID /T /F` process-tree cancellation. Neither the probe nor runtime ever calls a login, shell, browser automation, or paid API.
- `ai-family-windows-sidecar.mjs`: composes the user-mode probes and runner but provides **no entrypoint or automatic execution** without an independently trusted `broker.getSignedConsent`, `broker.verifySignedConsent`, and `leaseClient.renewLease`. The broker must cryptographically check and issue user approval; boolean flags supplied in job JSON do not authorize a process.
- `ai-family-dispatch.js`: automatic Codex image generation now fails closed with `CODEX_IMAGE_RUNTIME_UNVERIFIED`; a text-only CLI cannot truthfully claim to generate an image.
- Unit tests cover tampered binaries, signed-consent mismatch, OAuth/API-key refusal, missing/stale lease, duplicate jobs, maximum 2 per lane, 60s/600s policy boundary, abort, heartbeat failure, output cap, OS token checks, no default broker.

## Required operational prerequisites

1. Run the user-mode sidecar with least-privilege scoped process identity. Validate the actual Windows access token and file-system permissions (read-only per-job workspace and verified signed executable) on user2 and user3; never launch it from the Device Agent's elevated process.
2. Implement an authenticated, *separately scoped* device queue/lease client and a signed, revocable consent broker; provide the authorization callbacks. The current privileged device token must not be copied into or exposed to the sidecar. No generic arbitrary-shell task.
3. Demonstrate subscription-mode `codex login status` and `claude auth status` from the *same non-elevated* user context. Reject API-key billing, even when a CLI reports signed in. Do not auto-log in or copy user credentials.
4. Verify 180s/600s timeout, heartbeat renewal across initial five-minute lease, process tree termination, offline/restart/idempotency, signed result receipt and tenant isolation on real registered Windows nodes. The repo's `ai.family.codex` task allowlist currently handles only proven text brainstorming; Codex image output must be independently proven before support is enabled.
5. Pass authentic CI, approved EKODI orch_recovery, guarded staging, login-only admin E2E and Cloudflare Workers requests/error/CPU checks. Production activation is excluded from this PR. Check privacy, user approval, cost and one-week observations on or after 2026-11-09.

## Testing and completion integrity

The standalone Node mock-process tests in the isolated container passed **16/16** before publishing the GitHub source. The connected repository's full `npm test`, CI, real Windows user session and production data remain independently required. Never count these unit tests as authentic device E2E or production verification.

Status: **code ready for review / no native sidecar process connected / auto-dispatch OFF**.
