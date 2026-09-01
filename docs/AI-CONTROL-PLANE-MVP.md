# EKODI AI Control Plane MVP

Canonical hostname: `ai.ekodi.kr`.

The control plane accepts one task, selects replaceable AI providers, assigns isolated code branches when required, records runs, and preserves the central EKODI human approval, merge, and deployment gate.

## Connection classes

1. **Free official API**
   - Gemini API is the preferred direct cloud provider when `GEMINI_API_KEY` is configured.
   - The key is stored only as a Cloudflare Worker secret.
2. **Account CLI node**
   - A user-authorized computer keeps provider login credentials locally and polls `ai.ekodi.kr` outbound for work.
   - `node:codex` uses the official Codex CLI signed in with the user's ChatGPT account.
   - `node:gemini-cli` and `node:claude-code` can be enabled only after their official CLI authentication is present and their account terms permit the intended use.
   - Central EKODI never receives browser cookies, provider passwords, or CLI credential files.
3. **Optional paid official API**
   - OpenAI (`OPENAI_API_KEY`) and Anthropic (`ANTHROPIC_API_KEY`) are opt-in fallbacks rather than the default path.
4. **External adapter**
   - `AI_WORKER_URL/TOKEN` remains an optional provider-neutral escape hatch for approved future services.

## Free-first order

Default order is Gemini free API, ChatGPT-plan Codex node, Gemini CLI node, Claude Code node, then optional paid APIs and approved external adapters. Availability and user-selected providers can change the actual plan.

## Account-node pairing

An authenticated EKODI administrator creates a short-lived one-time pairing code in `ai.ekodi.kr`. A node exchanges that code for a node-specific secret, stores it locally, advertises only the CLI providers it can currently execute, and polls for leased jobs. Pairing codes and node secrets are stored in D1 only as SHA-256 hashes.

Account nodes are outbound-only. No router port forwarding, public PC endpoint, or central browser-session storage is required.

## Provider policy

Do not automate consumer web interfaces by scraping or programmatically extracting output where the provider terms prohibit it. Prefer official APIs and official account-authenticated CLIs. Do not bypass CAPTCHA, rate limits, usage limits, provider safety controls, or account security measures.

AI-generated code remains isolated from `main` and production. A successful run moves the task to `approval_required`; it does not directly merge or deploy production changes.
