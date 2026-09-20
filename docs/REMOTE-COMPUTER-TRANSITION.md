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
