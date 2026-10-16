# EKODI · Cloudflare Analytics-only credential

## Verified production state (2026-10-11)

The latest successful daily collector (run 38117732969) wrote a **partial** aggregate for previous UTC day 2026-10-10: 1 of 6 zones, 109 hosts. The five rejected zones all returned the safe classification `permission_denied`. Site Core release run 38121464337, including all 46 authenticated Admin Chromium panels, and the Control API production release succeeded independently. **Do not report 6/6 coverage until the collected status and remote D1 values prove it.**

Rejected zone names: `cgma.or.kr`, `ekodibiz.kr`, `ekodichurch.kr`, `seonammedi.kr`, `서남권국립의대.kr`. These are separate Cloudflare DNS Zones; their analytics must not be estimated from `ekodi.kr` host requests. Browser sessions of EKODI path-based services are tracked independently.

## Least-privilege recovery

1. In the Cloudflare account authorized for the six EKODI zones, use **Account API Tokens → Create Token → Custom token**. Give it a clear name such as `EKODI Traffic Analytics Read`. Use **Account → Account Analytics → Read** and **Zone → Analytics → Read** as supported for GraphQL zone analytics, with zone resources restricted to the six authorized EKODI zones. Do not grant DNS/Workers/D1 write or API token management rights. For zones in a different Cloudflare account, use an independently authorized account token/collector; do not claim single-token coverage.
2. Add the generated token directly to repository **Settings → Secrets and variables → Actions → New repository secret**, name `CLOUDFLARE_TRAFFIC_ANALYTICS_TOKEN`. Never paste token values into chats, source files, logs, issue comments or PRs.
3. Merge the guarded code through official Orchestrator provenance and required CI, then run the **Traffic Intelligence Analytics** `workflow_dispatch` for a bounded verification of the previous complete UTC day. Compare Cloudflare zone coverage in job logs and the remote `traffic_intelligence_state` row. Keep partial status on any missing zone or User-Agent classifier degradation.
4. Preserve the existing `CLOUDFLARE_API_TOKEN` while transitioning: it is still used to discover zones and to write the approved D1 aggregates via Wrangler. Only `/graphql` requests prefer the read-only token. No new token? The previous collector behavior remains. A configured token with denied scopes must **not** silently fall back to broad credentials on GraphQL errors.
5. Require 6/6 authorized zones, complete previous UTC-day coverage, and privacy-safe per-site browser session reconciliation before closing issue #4061. Stop immediately on Cloudflare quota circuit errors (HTTP 429/1027). Never synthesize missing per-zone request counts.

Cloudflare references:
- https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/
- https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- https://developers.cloudflare.com/analytics/graphql-api/errors/
