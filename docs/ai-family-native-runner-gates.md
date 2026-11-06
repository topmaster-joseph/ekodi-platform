# EKODI AI family native runner — verified staging gates

Task #7796 extends the merged Phase 2 dispatcher. This change only closes an existing stale-result lease race; it does **not** activate provider execution or install an executable.

- The server checks the authenticated device job lease before evaluating native result content.
- Every result state transition (success, auth-required, retry, terminal failure) now uses an **atomic database predicate** that rejects a completion when a family job lease has expired. Legacy non-family jobs keep their prior behavior.
- A missing or malformed lease fails closed even when a device submits `verified: true`.
- `AI_ROUTE_FAMILY_AUTO_DISPATCH` remains false. No provider can advertise a usable native capability without a separately verified, least-privileged local runner.
- Native CLI work must not be executed from the Device Agent's elevated Scheduled Task. That task runs with elevated Windows privileges; launching user-writable Codex or Claude Code files from it would create a privilege-boundary risk.
- Use a separately authorized **non-elevated** runner identity, narrowly scoped consent and device tokens, no generic shell, bounded read-only filesystem access, explicit OAuth/subscription validation, per-job cancellation and lease heartbeat, and verified provenance before enabling a native provider.
- Real Windows Codex/Claude Code CLI execution and authenticated `ekodi.kr/admin` UI E2E are still pending. Do not claim production readiness based on CI alone.

For next steps: create a non-elevated local sidecar with constrained device credential scope; separate native-CLI claims from privileged device-management commands; run authenticated canary and host verification without turning auto-dispatch on.
