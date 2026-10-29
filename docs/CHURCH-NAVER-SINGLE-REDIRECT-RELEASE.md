# EKODI Church Naver ownership: limited Cloudflare redirect exception

**Site:** `ekodichurch.kr`  
**Owner proof URL:** `https://ekodichurch.kr/naver85321326d5553a0caa3a944158fc2969.html`  
**Required body:** `naver-site-verification: naver85321326d5553a0caa3a944158fc2969.html`

## What was verified

- EKODI official PR #6897 merged. Post-merge release #40923215206 deployed the dedicated path-only Worker but failed at the `--inspect` step, before the redirect rule was changed.
- The official GitHub Actions run logged `Cloudflare API HTTP 403 :request is not authorized` on GET `/zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint`.
- The **existing** GitHub secret `CLOUDFLARE_API_TOKEN` has enough permission for Worker upload / route deployment and zone discovery but **not** to read or update zone Single Redirect rules. No bypass through a global API key or broad token is permitted.
- The real proof URL still returns a 301 to the church homepage and is **not yet eligible** for Naver owner confirmation.

## One-time owner access setup (required before re-run)

1. Log into the **EKODI Production** Cloudflare account. Create a **new API Token** scoped to exactly the `ekodichurch.kr` zone only. Allow *Zone → Zone → Read*, *Zone → Single Redirect → Read* and *Zone → Single Redirect → Edit* (API permission names can appear as *Dynamic URL Redirects Read/Write*). Do not grant DNS Edit, Pages Edit or broad All zones.
2. Save that token only as the GitHub Actions repository secret **`CLOUDFLARE_CHURCH_RULES_API_TOKEN`** in `topmaster-joseph/ekodi-platform` → Settings → Secrets and variables → Actions. Never paste the token into a PR, issue, log or chat.
3. The guarded deployment `.github/workflows/deploy-church-naver-proof.yml` retains the original Worker deployment token `CLOUDFLARE_API_TOKEN` for Worker-only steps. The dedicated token is exposed **only** to the rule-inspection and rule-edit steps. Supply an authorized EKODI Orchestrator release branch and exact task ID. The workflow verifies the receipt and stops on missing or insufficient permissions.
4. The rule tool reads the zone `http_request_dynamic_redirect` ruleset, verifies exactly one enabled rule named **EKODI Church canonical path redirect**, and retains its original destination/target/actions. It then adds only `and (http.request.uri.path ne "/naver85321326d5553a0caa3a944158fc2969.html")` to the existing expression, via one-rule PATCH. Other rules and DNS are unchanged. Second run is idempotent.
5. The job must prove that the original proof URL responds HTTP 200 with the exact required body **and** the homepage `https://ekodichurch.kr/` still returns 301/302 to `https://ekodi.kr/ekodichurch/`.
6. **Only after live proof succeeds**, select HTML file upload in Naver Search Advisor and click **소유확인**. Then submit the site's published sitemap if applicable. Never report indexing until Naver provides confirmation.

## Stop conditions

- 401/403 Cloudflare ruleset API: check *zone-scoped* permission, not a new secret pasted into source.
- Multiple or absent target rules, altered redirect target, missing zone, changed rule set, unexpected homepage movement: stop and audit; no broad replacement or URL redirect deletion.
- A successful Worker upload **alone** is not a successful Naver ownership deployment.

References: [Cloudflare Single Redirect API token permissions](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/), [Cloudflare update one rule](https://developers.cloudflare.com/ruleset-engine/rulesets-api/update-rule/).
