# EKODI Ollama local node (opt-in)

The EKODI Orchestrator remains cloud-first and all delegated execution stays behind the authenticated node queue. Ollama is a **local-only optional execution adapter** (`node:ollama-local`), not a public API.

## Installation and readiness

1. Install Ollama from the official installer on a user-controlled desktop. Pull a local model, e.g. `ollama pull qwen3:0.6b`.
2. Configure Ollama to bind only `127.0.0.1:11434`. Set `OLLAMA_NO_CLOUD=1` and put `{"disable_ollama_cloud":true}` in `~/.ollama/server.json`.
3. Set `EKODI_ENABLE_OLLAMA_LOCAL=true`, `OLLAMA_NO_CLOUD=1`, and `EKODI_OLLAMA_MODEL=qwen3:0.6b` in the desktop node **process environment**.
4. The adapter advertises Ollama only if the exact model is installed and available via the local tags API, cloud is disabled, and at least 1.5 GiB RAM is free. If not, the node does not advertise it. An empty provider heartbeat withdraws stale capabilities.
5. Generate a single-use, expiring pairing code through the authenticated EKODI AI node administrator panel; then in the checked-out repository on the desktop run `node scripts/ai-account-node.mjs --pair CODE`. Credentials must never be pasted into issue trackers, source, or logs. Start the paired node process using the authorized desktop agent or service manager. The node pulls jobs outbound over HTTPS.

## Task routing and safety

- Provider ID: `node:ollama-local`; selected by **explicit task request only** (`requestedProviders: ["node:ollama-local"]`).
- Accepts small `general` and `writing` tasks only; refuses analysis and code tasks, any code-branch job, input over 6000 characters, or calls to a remote/cloud Ollama model.
- Calls a fixed loopback endpoint. It never opens port 11434 to the internet or enables a tunnel.
- Memory-conscious defaults: 1024-token context, 160 predicted tokens, one request per local scheduler concurrency slot, `keep_alive:0` to release the model after a request. Real throughput must be benchmarked per device.
- Read-only `node scripts/ai-account-node.mjs --doctor` displays detected provider readiness and resource pressure, but never pairing tokens, subscription identities or secrets. The scheduler also pauses outbound job leasing if RAM usage is above 90 percent on an eligible desktop.
- Node pairing, rate limits, governance, task approval, cost policy, branch isolation and audit are unchanged. The GPT/OpenAI fallback is **not** used automatically without delegated budget.
- Local CPU execution has power/hardware cost; “no model API fee” does not mean zero operating cost.

## Test and rollout

```sh
node --test test/ollama-local-provider.test.mjs test/ai-account-node-scheduler.test.mjs
node --test test/ai-control-platform.test.mjs test/ai-control-provider-router.test.mjs
```

The adapter is disabled by default. Deploy only after relevant checks, a valid pairing, observed outbound heartbeat, a safe test job completing in the central queue, and production read-only verification. Machines with insufficient free RAM must remain unavailable until resources improve. Do not report central integration completed from a successful local Ollama prompt alone.
