# EKODI Claude Code CLI account node

Claude Code is a local CLI that runs the agent but sends model requests to Anthropic servers. It is **not offline local inference**, unlike Ollama.

## Subscription-only workflow

- Install the official native Claude Code CLI; on Windows this normally provides `%USERPROFILE%\\.local\\bin\\claude.exe`.
- Sign in with the individual's authorized Claude Pro/Max, Team, or Enterprise subscription using `claude auth login` if necessary. Only the authenticated user can do provider consent.
- Run `claude auth status` to verify `loggedIn:true`, `authMethod:claude.ai`, `apiProvider:firstParty`, and a supported subscription type. Do not log/store the status JSON: it contains identifying details.
- Set `EKODI_ENABLE_CLAUDE_CODE=true` and `EKODI_CLAUDE_INTERNAL_ONLY=true` on the authorized node. Default is disabled. The subscription lane is reserved for the owner's internal code-development jobs on isolated `ai/` branches in allowlisted EKODI repositories, **not public `/ai` users or resale/shared account usage**. API-key or remote proxy billing variables prohibit subscription-mode autodiscovery and execution.
- Inspect readiness without revealing authentication secrets using `node scripts/ai-account-node.mjs --doctor` before enrollment; an unpaired node must not lease any work.
- Enroll the desktop node with an expiring EKODI central pairing code via `node scripts/ai-account-node.mjs --pair CODE --pair-only`. This is a separate authenticated administration step. Never commit pairing tokens to Git.
- Use the existing node outbound HTTPS job queue with `node:claude-code` as the requested or ranked provider. A node's Claude availability is checked against the active subscription.
- Anthropic's Agent SDK documentation restricts third-party products from offering `claude.ai` subscriptions or rate limits without its approval. EKODI therefore does not expose this account to customer-facing features; those require an authorized commercial API arrangement.
- The CLI handles plan limitations; subscription capacity is shared with the Claude app and has five-hour and weekly limits. The JSON `total_cost_usd` is indicative consumption pricing, **not proof of a separate bill**. Do not enable paid API credits, Console auto-reload or paid fallback without separate explicit delegated budget.
- Rate-limit and authentication errors must mark this provider unavailable and allow the EKODI router to continue other already authorized provider lanes.

## EKODI control and scope

- For personal, interactive read-only work outside the EKODI queue, use `claude -p ... --permission-mode plan` with very few turns. The EKODI subscription queue intentionally refuses public/general text tasks.
- For internal development code tasks, the central EKODI node creates an isolated Git worktree, uses `acceptEdits` permission mode, and explicitly permits only Claude's built-in `Read,Glob,Grep,Edit,Write` tools; shell, network, MCP and other tools remain unavailable. The EKODI node—not Claude—performs the deterministic Git commit/push, with CI, constitutional gates, review, deployment and production verification still required.
- Keep secrets, personal data and cross-tenant content out of model prompts unless a separate authorized data-processing contract exists. Shell, GitHub and runtime secrets are never delegated to the CLI as a bypass.
- On a small desktop such as user3 (8 GiB RAM), run one local AI job at a time, and avoid overlapping large Ollama inference with Claude Code. Ollama's 1.5 GiB free-memory gate still applies separately.

## Verification

```sh
node --test test/claude-code-subscription-provider.test.mjs test/ai-account-node-scheduler.test.mjs
node --test test/ai-control-platform.test.mjs test/ai-control-provider-router.test.mjs
```

Until this branch passes its guarded merge/release and the node is actually paired, no live EKODI remote-task execution is claimed. The local CLI being logged in does not authenticate the central EKODI queue.
