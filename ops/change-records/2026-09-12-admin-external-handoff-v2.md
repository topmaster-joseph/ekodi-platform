# Admin external handoff single-shot v2

- Base: protected `main` at `01941e7044e507a93ff0bf9b4471a6e1da972a86`
- Scope: Admin external service handoff only
- Root cause: external Admin anchors could begin native navigation and then re-enter internal panel routing, causing a second fallback click and intermittent HTTP/2 navigation failures.
- Change: build-time patch makes external `a.nav[href]` navigation single-shot when no internal panel exists; internal panel and demand routing are unchanged.
- Guardrail: fail-closed postbuild requires exactly one expected navigation hook; regression test fixes the contract.
- Validation required: orchestration gate, full tests, staging, guarded production promotion, registered service verification, authenticated Admin E2E.
