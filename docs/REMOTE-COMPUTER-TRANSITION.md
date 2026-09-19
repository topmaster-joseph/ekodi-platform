# EKODI Remote Computer transition policy

## Decision

EKODI uses Remote Desktop Commander only as a temporary external bridge while the EKODI native remote-computer capability is not production-ready.

The permanent target is the EKODI Device Agent + native Remote Computer Provider. The target must not require a third-party remote-command subscription or per-call provider fee.

## Current phase

- Temporary bridge: Remote Desktop Commander
- Native target: `ekodi-native-remote-computer`
- Provider contract: `ekodi.capability-provider.v1`
- Policy: `REMOTE-COMPUTER-001`
- Paid external upgrade: never automatic
- External quota exhausted: pause the external path or use a verified native path; do not silently purchase or upgrade
- Provider lock-in: forbidden

The temporary bridge can be used only when it preserves the EKODI security boundary. Existing free allowance may be used, but exhaustion of that allowance is not permission to move to a paid plan.

## Native cutover gate

Cutover becomes eligible only after all of the following are verified:

1. Native service is production-ready.
2. The enrolled device heartbeat is healthy.
3. The requested operation capability is verified on the device.
4. Security and authorization boundaries are equivalent to or stronger than the current contract.
5. Mutating operations use the verified isolated execution boundary.
6. Production verification confirms the real user flow.

After the gate passes, the router selects the EKODI native provider first and retires Remote Desktop Commander from the default route. The temporary bridge may be re-enabled only as an explicitly approved, security-equivalent fallback.

## Cost boundary

"Free" in this policy means no third-party remote-command subscription or per-call provider charge for the normal native execution path. EKODI may still have ordinary infrastructure, electricity, network, domain, storage, or cloud costs.

The router must not interpret a provider quota error as authorization to purchase a plan, add billing, or expand permissions.

## Security boundary

The transition does not relax existing controls:

- Host observation stays allowlisted.
- File mutation and terminal execution require the verified isolated execution fabric.
- Screen capture and desktop input remain consent-bound.
- Reusable credentials must not be exposed.
- Direct production mutation remains forbidden outside the release gateway.
- Device and operation authorization remains scoped and auditable.

## Rollout

1. Keep the existing Remote Desktop Commander bridge available for already paired USER devices.
2. Complete the EKODI Device Agent native execution capabilities behind the provider contract.
3. Verify native readiness in sandbox and staging.
4. Canary on an approved desktop device.
5. Verify heartbeat, execution receipt, recovery, audit and failure handling.
6. Mark native service ready.
7. Cut the default route to the native provider.
8. Disable the temporary Remote Desktop Commander route by default.
