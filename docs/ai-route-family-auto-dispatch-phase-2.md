# AI route family automatic dispatch — Phase 2 foundation

Task: `issue-7558`

`AI_ROUTE_FAMILY_AUTO_DISPATCH` is an independent server-side flag and defaults to `false`. When it is off, Admin Assist keeps its existing advice/submit behavior. When it is on, eligible requests may enter the existing authenticated hybrid execution queue and return an asynchronous job identifier.

The foundation is intentionally fail-closed. It does not add a shell executor, consumer AI web automation, OpenAI API, or Anthropic API. `node:codex` is eligible only for image/brainstorm requests after a node advertises `aiFamilyCodex`; the implementation does not claim that Codex can generate images. `node:claude-code` is eligible for code, analysis, and documentation after `aiFamilyClaudeCode` is advertised. No node capability means `RUNNER_CAPABILITY_UNAVAILABLE`, with no job and no execution claim.

Successful results require an authenticated device result plus a runner receipt bound to job ID, lane, and device ID. The UI labels results with the actual lane (`실행: Codex` or `실행: Claude Code`) only after that receipt validates. Status includes a processing note after 60 seconds. General work times out after 180 seconds and code work after 600 seconds. Hybrid leases remain five minutes and heartbeat renewal is fenced to the assigned authenticated device before reassignment.

Capacity is capped at ten active family jobs globally and two jobs per model per device. Duplicate active submissions by the same administrator and tenant/site context return the existing job. All lanes have `costKrw: 0`; paid API fallback is not permitted. Human-gated requests remain on the existing human-gate path, and dispatch requires a super-admin session plus the existing site context/RBAC projection.

The native device-side CLI adapters are not part of this phase. Until an authorized adapter implements the closed task contract, uses the authenticated heartbeat endpoint, and emits the required receipt, the server reports the lane as unavailable rather than simulating success.
