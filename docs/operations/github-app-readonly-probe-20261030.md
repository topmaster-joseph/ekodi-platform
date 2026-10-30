# EKODI GitHub App verified read-only token and quota probe · 2026-10-30

Owner: EKODI Orchestrator · Parent issue #6630

**Source-only / OFF / NOT DEPLOYED.** The module `github-app-readonly-probe.js` is a private library function; it has **no HTTP route, cron schedule, browser entry point, direct merge, status POST or production access by itself**. This commit does not enable or prove a real EKODI GitHub App installation.

## Exact security boundary

- Requires `EKODI_GITHUB_READONLY_PROBE_ENABLED=true` explicitly. Unset means zero outbound requests.
- Requires trusted, server-side environment with `EKODI_GITHUB_APP_ID`, `EKODI_GITHUB_INSTALLATION_ID`, and `EKODI_GITHUB_APP_PRIVATE_KEY`. Private key must be unencrypted **PKCS#8 PEM** in a Cloudflare secret or another owner-managed secret vault; GitHub's original PKCS#1 RSA PEM must be converted locally by an authorized operator, never sent to chat, source or D1. Do not use a personal access token or copy the ChatGPT GitHub connector's app identity.
- Signs the app JWT with RS256 WebCrypto, `iat` 60 seconds before now and `exp` eight minutes after now. Exchanges it only at GitHub's exact `POST /app/installations/{installationId}/access_tokens`; the request scopes the token to **one repository** (`ekodi-platform`) and **`metadata:read` only**.
- Rejects a token whose scoped GitHub response does not affirm the one exact canonical repository, metadata-only permissions and a future expiry. No token/JWT/key is logged or returned. Never depend on a fixed `ghs_` token length; GitHub has new stateless token variants.
- Calls exactly one metadata read `GET /repos/topmaster-joseph/ekodi-platform` with manual redirects; validates the returned repository identity and complete, authentic GitHub core rate headers. Only then inserts the observed rate quota into the existing protected D1 `github_operations_api_budgets` table via `recordTrustedGitHubQuota`. No quota values may come from a webhook body or frontend.
- Deny on invalid keys, missing DB, wrong identity, 401/403/429, redirects, insufficient permission, absent/mismatched headers or D1 error. No retry storm, no write capability, no duplicate event dispatch or job authority.
- `EKODI_GITHUB_BUDGET_ADMISSION_ENABLED` remains OFF. A verified read-only observation is **not** permission for any mutation or proof that production quota admission is active.

## Independent activation milestones

1. Authorized owner registers a dedicated EKODI-owned GitHub App, requests the minimal GitHub App repository metadata read permission, installs it on only the authorized EKODI repository, and records the actual App ID and installation ID.
2. Owner stores its converted PKCS#8 signing key only in a protected server-side secret store, enables staging-only probe flag, and reviews actual permissions. Do not log or email credentials.
3. EKODI Orchestrator verifies narrow exact-head tests, mission policy, protected PR, staged deploy, genuine token exchange, measured headers in D1, UI freshness and no quota counts invented.
4. Only after the owner explicitly authorizes production probe activation, run one read-only canary, inspect the measured GitHub `core` observations and expected API call count, revoke or rotate credentials on failure.
5. Separately enable the signed GitHub App webhook and the shared quota admission transport for the *full set* of permitted callers after cross-run concurrency / replay / review / lease tests and a rollback. The probe alone does not provide them.

### Tests

`node --test test/github-app-readonly-probe.test.mjs`

The test suite generates an ephemeral test RSA key, validates the JWT signature, simulates the token exchange and GitHub metadata response, checks header-to-D1 evidence, and denies permission spoofing, redirects, incorrect identity, stale/missing headers and missing credentials without touching real GitHub or production.

References:
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app

A GitHub App typically does **not** eliminate the 5,000/hour base quota; it provides an installation-scoped budget that can be separately governed, scaled where GitHub permits, and reduced by Webhook and conditional reads.
