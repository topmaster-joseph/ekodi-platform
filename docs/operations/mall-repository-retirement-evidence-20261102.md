# Mall legacy-repository retirement evidence — 2026-11-02

Task: `mall-legacy-smoke-retention-20261102` · Owner program: #7502.

Status: **partial verified evidence, legacy GitHub repository retained**. This is not a repo-deletion authorization, all-site migration claim, or evidence of completed production retirement.

## Independently restored complete Git history

Source: private `topmaster-joseph/ekodi-mall`, default main.
Source main SHA: `1afbfdead2c3054b37fbd2e7bb19585220883d44`.
Backups created using `gh repo clone --mirror`, `git bundle create --all`, `git bundle verify`, `git clone --mirror` and full `refs/heads`/`refs/tags` ref-to-SHA comparisons.

| EKODI authorized device | Storage | Bundle size | Refs verified | Restore main SHA | Hash |
| --- | --- | ---: | ---: | --- | --- |
| user2 | Private local EKODI/RepositoryArchives | 380,329 bytes | 38 | matches source | matches below |
| user3 | Private local EKODI/RepositoryArchives | 380,329 bytes | 38 | matches source | matches below |

SHA-256 (both): `0C3FFEC139D07FF0DC1251BB720A922D1434AB600377276D6DE74843EC2424B6`.
Both backup clones and complete refs/heads + refs/tags comparisons passed. Both isolated temporary clones were removed after successful restoration. The bundle includes Git history but does not establish backups of provider secrets, Cloudflare configuration, external assets or production D1/R2 data.

**Remaining backup requirement:** this confirms two separate authorized devices, **not** an independently verified offsite, immutable or encrypted long-term recovery store. An offsite copy, retention permission and later restore drill are required before irreversible repository deletion.

## Verified centralized release and live route

- Canonical source: `topmaster-joseph/ekodi-platform/sites/ekodi-mall/`.
- Protected release workflow: `.github/workflows/deploy-ekodi-mall.yml`.
- GitHub Actions run [41401112353](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/41401112353) on 2026-11-02 completed success; jobs `validate`, `staging`, `production` all successful. Its `head_sha` is `a050e10ce2af1388a7a8096a199847d0d955d324`.
- Canonical site `https://ekodi.kr/ekodimall/`: HTTP 200 from authorized user2 PC.
- `https://ekodi.kr/ekodimall/admin/channel-settings`: HTTP 200, contains `workspace-admin.js`.
- `https://ekodi.kr/workspace-admin.js` asset contains `channel-workbench`, `channelAccountForm` and `data-account-auth`.
- `https://ekodi.kr/marketing-publish-api/health`: HTTP 200, `ok:true`, service `ekodi-marketing-publishing`, `scheduler` and `channelAutomationCore` enabled.
- **Scope limitation:** successful GitHub workflow and HTTP content do not by themselves verify exact Cloudflare release SHA, production login roles, checkout, settlement, account ownership or rollback. No live payment mutation was attempted.

## Legacy workflow retirement review

- Git tree of current `ekodi-mall/main` lists 4 tracked workflows: `validate.yml`, `promote-ekodi-domain.yml`, `smoke-production.yml`, `run-revenue-autopilot-publisher.yml`. They are read-only validation/smoke/retirement proof; no Wrangler production deployment was found in these four.
- GitHub Actions workflow API listed 7 active workflow records, including 3 workflow paths absent from the current `main` tree. Historical GitHub Actions metadata may outlive YAML files; reconcile actual active dispatch/webhooks and credentials before deleting.
- `README.md` and `package.json` explicitly declare this legacy repo a read-only archive; `npm run deploy` is blocked.
- The legacy `smoke-production.yml` also verifies admin and Marketing Publishing public health not currently covered by the central Mall production workflow. This task ports those read-only checks into the central guarded Mall release, with mock tests and no write operations.

## Remaining critical deletion gates

1. CI and Orchestrator protected promotion of the retained smoke check to canonical `main` (separate from live result).
2. Exact production Cloudflare source commit/release artifact receipt and independently reproducible rollback, including storefront, API/D1 and admin login scope.
3. Audit remaining GitHub Actions records and webhook/cron/integration credentials; disable/revoke legacy write capabilities with actual provider evidence.
4. Offsite immutable history recovery copy and restore; contractual/repository-scoped owner approval for irreversible deletion.
5. Source-of-truth role discrepancy: canonical SOT still marks old repo as `active-satellite`, while that repository explicitly states `legacy read-only`. Reclassification is a separate C2 change with owner-gated amendment; do not bypass.
6. After all gates and deletion: reverify canonical production and admin surfaces, repo absence, and archive restoration; reconcile SOT and retention registry.

Deletion performed: **no**. Cloudflare live configuration modified by this task: **no**. GitHub legacy repository modified: **no**.
