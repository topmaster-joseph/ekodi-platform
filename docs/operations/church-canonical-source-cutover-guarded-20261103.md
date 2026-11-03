# Church canonical-source cutover — guarded release design

Task: `church-guarded-source-cutover-20261103` · Owner/EKODI Orchestrator issue #7575 · All-site source consolidation #7502.

## What is implemented (without switching production)

The existing central `.github/workflows/deploy-ekodi-church-homepage.yml` now has **two fail-closed source modes** for the **same** Cloudflare Pages project `ekodi-church`:

| Mode | Authorization | Source | Artifact marker |
| --- | --- | --- | --- |
| Legacy (default) | Existing EKODI release receipt | `topmaster-joseph/ekodi-church` `main` | `ekodi.church-release.v1` |
| Canonical (disabled until explicit owner approval) | `CHURCH_CANONICAL_SOURCE_CUTOVER_APPROVED=true` **and** existing orchestrator receipt **and** `refs/heads/main` | Exact invoking platform SHA, `sites/ekodi-church` | `ekodi.church-release.v2` including exact `payloadSha256` |

A workflow file push does **not** deploy the Church site: only an authorized `workflow_dispatch` that passes the existing EKODI release gate can execute the deployment job. The same Cloudflare account, `ekodi-church` Pages project, independent release history, CSP, headers, live site and canonical path are retained. No new project, second release workflow or subdomain is introduced.

The canonical source is pinned to the **exact** GitHub Actions SHA, and a mismatch with checked-out platform commit fails the job. The module is linked for existing native Church tests; Pages artifacts are built only by `scripts/build-church-pages-candidate.mjs`, which checks source blob hashes and excludes private/dev files. The production marker must match the exact platform SHA **and** local candidate artifact digest; the legacy mode requires the original v1 marker. Production functional and real-host checks remain in the existing workflow.

## Classification and authorization

Preparing a dormant reversible source option is not itself authority to modify the live source topology. Actually enabling it switches canonical source ownership/release provenance, classified as constitutional **C2/C3** per `governance/constitution/constitution.json`. A **separate owner-confirmed constitutional amendment/transition record**, rollback evidence and EKODI Orchestrator receipt are required before changing the repository variable. Merely merging this PR or writing `true` into a PR description does not satisfy that requirement.

**Do not set `CHURCH_CANONICAL_SOURCE_CUTOVER_APPROVED` via an agent task, script or unverified user statement.** Owner-approved change control must explicitly identify the Church source transition, target and rollback plan, and designate the release operator. Default legacy mode remains operational unless the approved flag is set.

## Gate sequence before production switch

1. Verify protected PR and `main`, `sites/ekodi-church/source-import-manifest.json`, the upstream repository backup and 13 normalized-file proof.
2. Preserve the old Church `main` commit `520d4f2daf7e5e4dc53bf928c9df626b5f896600`, `ekodi.church-release.v1` and the existing Cloudflare Pages deployment as rollback references.
3. Obtain C2/C3 owner confirmation and amendment record; authorize source cutover flag and the exact EKODI Orchestrator task/branch receipt.
4. Build the candidate at the exact authorized canonical `main` SHA; preview and check header, login return destination, visitor/member/admin scope, attendance/giving isolation, multi-language pages, dated worship, live broadcast synthetic broadcaster/viewer, church-pastor-api independence, mobile/desktop.
5. Dispatch the existing guarded Church Pages workflow; compare the live `church-release.json` v2 marker `sourceSha` and `payloadSha256` to the approved artifact. Check status, route functionality, console/errors and observability.
6. On failure, roll back the **same** Pages project to its verified old deployment; do not silently switch authentication, finance, database or shared API.
7. Only after source switch, turn off obsolete original-repo write workflows and external automation, verify independently-restored offsite archive and seek **separate repository-specific irreversible deletion approval**.

## Current limitation and evidence

This change implements the guarded source-switch path. It neither approves nor performs the canonical production release. The old Church GitHub source remains in use until the flag/receipt and live marker change. The `scripts/build-church-pages-candidate.mjs` output was independently reproduced on two PCs at an earlier SHA (143 public source files + release marker; matching payload hash). A new artifact must be rebuilt for the **actual authorized future release SHA**.

Tests: `node --test test/church-guarded-canonical-cutover.test.mjs test/church-pages-candidate-build.test.mjs test/church-source-shadow-import.test.mjs`; `npm test` under `sites/ekodi-church`; central SOT/deployment/orchestration/security validation. All post-merge production claims require real URL and independent verifier evidence.
