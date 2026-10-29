# EKODI GitHub Control — signed Webhook and D1 observation queue

Tracking issue #6630. All work is under EKODI Orchestrator; this is not a second autonomous deployment authority.

## Implemented contracts
- POST https://ekodi.kr/api/orchestrator/github/webhook, **disabled by default**. GitHub HMAC SHA-256 is verified against the original request bytes before JSON parsing or database write.
- Only the canonical repository and exact GitHub App installation ID are accepted. Delivery identifiers and semantic event keys provide two replay barriers; the request body limit is 256 KiB.
- Production activation requires *both* the Cloudflare Worker secret `EKODI_GITHUB_WEBHOOK_SECRET` and the non-secret vars `EKODI_GITHUB_INSTALLATION_ID` plus `EKODI_GITHUB_WEBHOOK_ENABLED=true`. Do not store the secret in GitHub source, D1 or frontend assets.
- Apply approved D1 migration `migrations/202610290930_github_operations_control.sql` before activating the endpoint. Webhook storage is fail-closed (HTTP 503) when schema is unavailable.
- Durable D1 event and observation-only job records contain no full webhook payload, issue text, email, OAuth data, provider token or personal data. The existing Control API cron performs bounded local status transitions. **No GitHub API call, auto-merge or deployment originates from this queue.**
- Read-only platform super-admin route `/api/control/ai/v8/github` uses existing session and `ai:read` capability. The `/admin/control` AI Ops area has a manual-refresh GitHub operations subpanel. API rate remaining is shown as *not connected* instead of an invented metric.

## Protected rollout steps
1. Exact-head source/CI/constitution/security checks and EKODI Orchestrator approval.
2. Staging schema migration and HMAC/security test, approved production DB backup and migration.
3. Provision GitHub Webhook URL, owner-controlled installation ID and identical signing secret in GitHub settings and Cloudflare Worker secret store. The connector does not expose GitHub repository admin or Cloudflare secret write access: no attempt is made to bypass these controls.
4. Enable only after both endpoints are configured and official protected release has promoted the code; test signature failure, replays, wrong repo/installation, oversized payload and non-admin read rejection.
5. Confirm queued observations appear in `/admin/control` after a real GitHub event, and all event observability remains independent of production release authority.

## Remaining boundaries
Installation-wide API budget reservations, priority-aware GitHub API write dispatch, multi-run durable leases, accurate live API usage and full operation authority are **not** enabled by an observation queue. These require a separate protected release including authenticated GitHub app permissions and tested owner gates. Do not claim they are live merely because this PR was merged.

Verification: `node --test test/github-operations-webhook.test.mjs`, protected full CI and external production canaries. Related Church C3 #6533 remains unfinished until exact old-host Cloudflare retirement is externally verified.
