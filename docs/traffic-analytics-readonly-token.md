# EKODI Traffic Intelligence — 6-zone Analytics least-privilege recovery

## Verified cause and non-negotiable boundary

The production collector run [38117732969](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38117732969)
on the completed UTC day 2026-10-10 recorded **1 of 6 Cloudflare zones** and classified
the other five as `permission_denied` for GraphQL Analytics:
`cgma.or.kr`, `ekodibiz.kr`, `ekodichurch.kr`, `seonammedi.kr`, and `서남권국립의대.kr`.
The 109 included hosts are not a claim of six-zone coverage.

The collector's `CLOUDFLARE_API_TOKEN` continues to enumerate registered zones
and is used by the separate Wrangler D1 writer. Do **not** broaden this
deployment/write credential merely to enable zone analytics.

## One-time secret provisioning by an authorized Cloudflare owner

1. In Cloudflare, create a **custom read-only API token** with
   **Account → Account Analytics → Read** for the account owning these zones.
   Also authorize **Zone → Analytics → Read** for precisely the six necessary
   zones when required by the token/resource configuration; ensure the Zone
   resources include all six registered zones, not only the apex.
   No Workers, D1 write, DNS write or token-management permission is needed
   for the new analytics credential.
2. Store the newly created token in the EKODI GitHub repository Actions secret
   named `CLOUDFLARE_ANALYTICS_API_TOKEN`, through an authenticated repository
   owner. Never paste it into an issue, log, PR, or chat message.
3. The daily collector then uses **only** the read-only token for
   `POST /client/v4/graphql`. Zone enumeration retains the current credential,
   and D1 writes still use Wrangler's existing deployment credential.
   Until the new secret is provisioned, the legacy token is used as a
   backwards-compatible fallback and the daily status remains **partial**.
4. Run the existing **Traffic Intelligence Analytics** workflow once in the
   protected `main` context after provisioning. Examine the resulting
   per-zone safe status codes and the SQL execution receipt. Expect `6/6`
   only if all six GraphQL zone queries and classifier checks actually work.
   Review the zone resources and analytics permissions if any zone still
   reports `permission_denied`; do not loosen release gates or fabricate
   zeros for unavailable service-level request metrics.
5. Compare the D1 completed UTC-day aggregate with the Control API and
   System Health administrator view. Unclassified requests are kept
   unclassified, and partial/unavailable data never appears as complete.
   Confirm no raw IP address, URL path, User-Agent, or credential is stored.

Official references:
- https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/
- https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- https://developers.cloudflare.com/analytics/graphql-api/limits/

Release and token approval are separate actions. A code PR passing CI does not
mean the read-only secret is present, nor that 6-zone D1 reconciliation succeeded.
