# EKODI Native Execution Independence

EKODI owns the execution policy and treats external computer-use/remote-command providers as replaceable fallback adapters.

The canonical execution path is API/connectors and GitHub Actions first, then EKODI-managed cloud execution, EKODI Native Remote Computer and Device Agent, self-hosted runners, service connectors, and finally an external remote-desktop bridge.

External quota, pricing, outage, or product changes must not stop another verified EKODI execution lane. No fallback may bypass the orchestration gate, authority checks, secret boundaries, execution receipts, post-execution verification, or audit.

Native agents enroll with scoped capabilities. Mutating operations require an isolated executor. Secrets stay in a node-local or managed secret vault and are referenced by opaque IDs; secret values are never embedded in task payloads or logs.

High-impact changes remain human-gated. Unknown side effects, security-boundary failures, and destructive ambiguity stop fan-out rather than being retried through another provider.

A native lane becomes the default only after service readiness, heartbeat, capability verification, isolation, receipt/recovery/audit evidence, and a production canary all pass.

This policy extends REMOTE-COMPUTER-001 and the existing EKODI capability executor. It does not claim that a native device runtime is production-ready until those proofs exist.
