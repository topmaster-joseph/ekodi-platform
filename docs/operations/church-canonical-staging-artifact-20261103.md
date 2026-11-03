# Church canonical source: offline staging artifact lane

Task: `church-canonical-offline-staging-artifact-20261103`. Tracking: EKODI Orchestrator issue #7575; source retirement issue #7502.

## Intent and isolation

This is a **no-credential, no-provider-write** preflight on the single canonical repository, following constitution 1.27.7 and protected recovery PR #7980. It builds a candidate from the exact protected `main` commit without creating a new Cloudflare Pages project or changing the independently operated `ekodi-church` Pages release unit.

`.github/workflows/church-canonical-offline-staging.yml` triggers only on protected main-source changes or a main-branch manual dispatch; its job requires `refs/heads/main`. The workflow uses only a read-scoped checkout and Node.js and **does not read or reference provider credentials or upload to Cloudflare**. It runs pinned-source tests and the native 195-test Church suite, builds the candidate and independently rehashes its contents, then publishes a 7-day GitHub Actions artifact for governed preview review. This workflow is **not** an alternative production deployment workflow; it has no Wrangler, Pages deploy or release-switch flag mutation.

## Independent artifact verification

`node scripts/verify-church-pages-candidate.mjs --source sites/ekodi-church --artifact <candidate-dir> --sha <exact-main-commit>`

The verifier checks the exact protected SHA; all expected source paths and every Git blob SHA; refuses symlinks, extra/private files and missing assets; independently recomputes the aggregate SHA-256; and verifies the v2 release marker source repo, directory, original upstream SHA, and reviewed Church PR #143/#144/#142 receipts. It fails closed on tampering and does not mutate the artifact.

The candidate artifact is intentionally **not a live website or real Cloudflare staging deployment**. The separate C3 deployment gate must still perform actual preview isolation and PC/mobile guest, authenticated Church member, admin/pastoral, attendance/giving privacy, nine-language, live broadcaster/viewer synthetic and rollback checks. An offline artifact does not prove real OAuth, Supabase, browser CSP of the deployed host, or a live stream.

## Production and legacy repository constraints

Only the *existing* `.github/workflows/deploy-ekodi-church-homepage.yml` is the Church release authority, with an orchestrator-issued protected release receipt, explicit production source cutover flag and exact main SHA. Verify the real `https://ekodi.kr/ekodichurch/church-release.json` v2 source SHA/payload and rollback in the same Pages project before marking operating source migration complete.

The former `topmaster-joseph/ekodi-church` repository and all other satellites remain **retained** until their independent source migration, immutable/offsite restore, legacy token/webhook and scheduled job retirement, and a separate repository-scoped human deletion authorization. This staging artifact workflow grants no destructive deletion rights.
