# EKODI Admin · GitHub Actions direct execution

## Purpose and boundaries

The authenticated **Deployments** panel on `https://ekodi.kr/admin` can offer two narrowly allowlisted `workflow_dispatch` actions:

- `cloudflare-production-usage-diagnose.yml`: read-only Cloudflare Worker usage diagnostics.
- `traffic-intelligence-analytics.yml`: the existing scheduled collector writes privacy-preserving daily aggregates to EKODI D1. This is **not** a read-only operation.

The caller must have an authenticated central EKODI admin session **and** be on the secret-manager owner email allowlist. Every dispatch requires a confirmation dialog and `x-ekodi-confirm-impact: github-workflow-dispatch`. The server ignores user-defined branch names and workflow inputs, uses `main`, and does not allow arbitrary workflows or repository names.

The GitHub API HTTP 204 means only that dispatch was accepted. It does **not** attest execution, success, deployment or complete zone coverage. The returned Actions URL is used to check the actual run and logs. Ambiguous requests are not retried automatically.

## One-time credential setup

1. Create a repository-scoped fine-grained GitHub credential for `topmaster-joseph/ekodi-platform` with **Actions: Read and write** and **Metadata: Read**. Prefer a short-lived GitHub App installation token from an authorized rotation broker; do not place a token in browser storage, site HTML, chat, source code or logs.
2. Provision this credential as a secret named `GITHUB_ACTIONS_DISPATCH_TOKEN` **on the Control API Worker runtime that hosts** `/api/control/secrets`. Do not mistake a GitHub Actions repository secret for a Cloudflare Worker secret: these are separate stores. Never reuse the general `GITHUB_CONTROL_TOKEN` inventory credential or the Cloudflare deployment token for dispatch.
3. Confirm the owner email is present in the existing secret-manager owner allowlist (`SECRET_MANAGER_ADMIN_EMAILS` or approved canonical owner identity configuration). Keep normal EKODI authentication active.
4. Open **Deployments → Cloudflare 권한 · GitHub Actions** and confirm the dispatcher reports configured before clicking **실행 요청**. A configured status only confirms the Worker secret exists; the first dispatch determines the real GitHub permission outcome.
5. Rotate and revoke unused credentials, and review access regularly. Scope the workflow runner secrets independently; nothing about this feature grants new Cloudflare permissions.

## Cloudflare GraphQL Analytics token

The Cloudflare documentation shown in the screenshot is the correct API token setup documentation. At the official [Cloudflare API Tokens page](https://dash.cloudflare.com/profile/api-tokens), create or replace **EKODI Traffic Analytics Read** with only **Account → Account Analytics → Read** and **Zone → Analytics → Read**, where offered and required by the authorized zones. Restrict account/zone resources to the zones managed by that token's account. Cloudflare zones in different accounts require separate appropriately scoped tokens/collectors. Do not grant API Tokens Edit, DNS Edit, Workers Edit, D1 Write or account administration to this read-only analytics token.

Store the generated value directly in [GitHub Actions repository secrets](https://github.com/topmaster-joseph/ekodi-platform/settings/secrets/actions) as `CLOUDFLARE_TRAFFIC_ANALYTICS_TOKEN`. Existing `CLOUDFLARE_API_TOKEN` remains used for the authorized Wrangler D1 write and zone discovery path. The collector must not silently fall back to a broader token after a denied read-only GraphQL request.

Cloudflare token scopes cannot be safely assumed to be editable in place; create a replacement with the correct permissions, update the secret, validate the collector for all authorized zones and then revoke the old token. This administrator UI deliberately does not create, reveal, mutate or expand provider credential scopes.

## Acceptance

- Secure endpoint denies anonymous/non-owner users and arbitrary workflows/refs.
- Without the isolated dispatch credential, the UI disables execution and shows a configuration message.
- With correct scope, the GitHub dispatch API returns 204; the panel reports **queued-unverified**, not success.
- Verify the actual Actions run, collector log, absence of 429/1027 throttling, and D1 coverage for all six authorized zones before claiming completeness.
- Any production deployment continues through the EKODI Orchestrator official provenance and protected release gates.

Related: [Analytics token recovery](traffic-intelligence-analytics-token.md), [Cloud Control boundaries](ekodi-cloud-control.md).
