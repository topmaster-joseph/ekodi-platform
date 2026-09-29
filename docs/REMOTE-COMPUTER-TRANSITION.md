# EKODI Remote Computer transition policy

## Decision

Remote Desktop Commander is a temporary external bridge only while the EKODI native remote-computer capability is not production-ready. The permanent target is the EKODI Device Agent + Native Remote Computer Provider without a third-party remote-command subscription or per-call remote-command fee.

## Current phase

- Temporary bridge: Remote Desktop Commander
- Native target: `ekodi-native-remote-computer`
- Policy: `REMOTE-COMPUTER-001`
- Paid external upgrade: never automatic
- External quota exhausted: pause that route or use a verified native path
- Provider lock-in: forbidden
- Foreground user desktop: user-owned and protected by default

The bridge policy is not evidence that native cutover has happened. Native completion requires the runtime `serviceReady` gate plus real-device proof.

## Native virtualization precedence

Whenever browser/runtime/desktop virtualization or computer-use automation is required, the normal route is an EKODI-owned capability first: the Autonomous Execution Fabric, EKODI Background Browser Worker, or EKODI Native Remote Computer capability as applicable. External browser/computer-use services remain temporary, replaceable fallback adapters only while the required native capability is not ready, unavailable, not yet implemented, or has a verified runtime/capacity failure. Every such fallback records the reason and the native capability gap; it must not become a permanent dependency by convenience.

## Mandatory cloud-first execution rule

For source, database, validation and deployment work, EKODI must not treat a remote desktop bridge as a required execution dependency.

Execution precedence is enforced as follows:

1. Repository-native/API path (GitHub branch, PR, CI and guarded deployment).
2. Service-native API path (for example Supabase project/database/runtime tooling) when the task belongs to that service.
3. EKODI-owned background or native execution capability after its readiness gate passes.
4. External remote desktop/computer bridge only for work that genuinely requires a user-owned machine or local-only application/file.

If any lower-priority route is unavailable, quota-exhausted, rate-limited or temporarily disconnected, the orchestrator must continue through an authorized higher-priority independent path whenever that path can complete the same task safely. A remote-desktop quota failure must not stop repository-native development, CI validation, service-native operations, or guarded cloud deployment.

Production rules remain unchanged: every mutation uses an isolated task branch/sandbox, protected production branches are not edited directly, and completion requires guarded merge/deployment plus production verification evidence. Fallback routing must never weaken authorization, isolation, review, rollback or verification gates.

## Native cutover gate

Cutover requires all of the following:

1. Native service is production-ready.
2. Enrolled-device heartbeat is healthy.
3. Requested capability is verified on that device.
4. Security/authorization boundaries are equivalent or stronger.
5. Mutating work uses a verified isolated executor.
6. Background browser work satisfies the dedicated-profile and focus-isolation contract.
7. Production canary verifies receipt, recovery, audit and real user flow.

After the gate passes, native becomes the default and the temporary bridge is removed from the normal route.

## Non-disruptive execution

The execution order is official API → background browser → isolated desktop → explicit foreground takeover.

A minimized window on the same interactive desktop is not isolation. EKODI must not silently reuse the user's active Chrome/Edge/Opera profile, steal focus, move the mouse, type into the user's desktop, or share the clipboard with an unattended worker.

See `docs/NON-DISRUPTIVE-REMOTE-EXECUTION.md`.

## Cost and failure boundary

External quota exhaustion is not authorization to purchase a plan or expand permissions. Existing free allowance may be used only while the bridge remains compliant. Normal native execution must not depend on a third-party remote-command subscription.

## Rollout

1. Merge provider/policy contracts and keep new executor capabilities fail-closed.
2. Upgrade an approved desktop Agent and verify heartbeat.
3. Run the background-browser canary with its dedicated EKODI profile.
4. Build and verify the full background Browser Worker.
5. Verify an isolated desktop executor separately.
6. Canary native operations and collect receipt/recovery/audit evidence.
7. Set `serviceReady=true` only after those proofs pass.
8. Cut the default route to native.
9. Disable Remote Desktop Commander as the default bridge.
