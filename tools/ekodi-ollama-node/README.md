# EKODI Ollama local AI node

This lightweight outbound-only connector integrates an existing Ollama service into EKODI AI Control. No Ollama endpoint, Windows file system, or browser session is exposed to the public internet.

## Environment
- Node.js 20+, Ollama listening on 127.0.0.1:11434
- Local model: qwen2.5-coder:1.5b
- EKODI AI Control: https://ekodi.kr/ai
- Compatible with the central /api/node/enroll, /api/node/lease, and /api/node/jobs/:id/complete contracts.

## Windows instructions
1. On the EKODI AI Control administrator screen, create an official 10-minute pairing code.
2. Run: powershell -NoProfile -File .\tools\ekodi-ollama-node\start.ps1 -Mode enroll
3. Paste the code locally; the returned node token is stored encrypted with Windows DPAPI for the current Windows user.
4. Run: powershell -NoProfile -File .\tools\ekodi-ollama-node\start.ps1 -Mode doctor
5. Run: powershell -NoProfile -File .\tools\ekodi-ollama-node\start.ps1 -Mode once
6. Only after authorized pairing and tests, run -Mode run for continuous polling. No automatic startup task is registered by these scripts.

## Safety boundaries
- Does not open inbound ports. The local Ollama address remains loopback-only.
- Provides only the ollama-local capability. Explicitly selected, non-branch jobs only.
- No arbitrary command execution, shell tools, filesystem tools, repository writes, or production changes are available to the model.
- Limit: 2,500 characters per prompt; 400 generated tokens; one job at a time.
- Enforces free local execution and rejects unrecognized/release tasks.
- Declines work if machine class is unknown/portable, free memory is low, or CPU load is high; telemetry still reaches scheduler once paired.
- Authenticating token remains on its owning machine; not included in Git or logs.
- Windows DPAPI enrollment binds to the Windows user, so reinstall must pair again under a different account.
- If a node is disconnected, central lease expiry/retry is owned by AI Control; do not disable central governance for automatic execution.

## user3 validation
Node status and Ollama model queries succeeded. Full mocked queue lease and completion tests passed.
Real EKODI enrollment, central task pickup, merge, release and production verification require separate evidence.
