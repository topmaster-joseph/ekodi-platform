# Church source migration — staged only (2026-11-02)

Task: `church-source-monorepo-import-20261102` · EKODI Orchestrator authority. This PR imports the complete current Church source tree and Git ancestry into the canonical repository, **without changing the serving production source or Cloudflare deployment workflow**.

## Verified starting position

- Church repository: `topmaster-joseph/ekodi-church`, main at `520d4f2daf7e5e4dc53bf928c9df626b5f896600`.
- Actual `https://ekodi.kr/ekodichurch/church-release.json` and `https://ekodi-church.pages.dev/church-release.json` both reported that legacy repo and exact source SHA at inspection.
- Both user2 and user3 independently saved full Git mirrors, created bundles, restored all **305 refs**, and matched bundle SHA-256 `c998cedd07cc3244e96c5f00562b2bfa1bf09116127f6575e361269906e483f9`.
- Backups are on two devices but **offsite separation is not verified**. Neither backup nor this PR is deletion authorization.

## Import

- `git subtree add --prefix=sites/ekodi-church ... main` **without squash**. Integration commit `612239948452b55510560807ddcb8a58fd39e46b` retains the old Church source commit as its second parent.
- Original 216 tracked paths and their blob SHAs equal the imported source exactly; both source tree objects are `30f2d5396b416aec9aca9773c84710052f4f8c35`.
- `sites/ekodi-church/source-provenance.json` adds truthful staged-only metadata. The exact imported snapshot remains recoverable at the integration commit tree, before this small metadata addition.
- The imported `.github` directory is *nested* in `sites/ekodi-church` and is not a root-level GitHub workflow. It must not be promoted as a new deploy lane.
- Source's `npm test` ran 190/190 pass in the isolated canonical repo clone; new import-gate tests 2/2 pass; central repository SOT guard passed.

## Non-goals and protected dependencies

- No changes to `.github/workflows/deploy-ekodi-church-homepage.yml`, Cloudflare Pages project, apex gateway/DNS, authentication, admin, Church Pastor API, YouTube broadcast, donation or confidential church/member data.
- No claim of production release from canonical Church source. Current release still references legacy Church repository; this is deliberate until a separate controlled cutover.
- Do not delete or archive `topmaster-joseph/ekodi-church`. Its old source SHA remains a live deployment input and rollback source.

## Next cutover plan and acceptance gates

1. Inspect release workflow, validator scripts, raw Pages `_headers`, Functions, route/API contracts and exact source SHA/marker producers for every legacy repository reference.
2. Prepare a separate C2/C3-reviewed release workflow patch that reads `sites/ekodi-church` from the canonical source and stamps the **canonical** release SHA while preserving independent Cloudflare Pages `ekodi-church` project and isolation.
3. Verify source-to-build parity at 216 imported files and preserve protected release receipt, consistent CSP and original path mapping.
4. Run separate production-authenticated guest/member/operator browser tests, worship packet, Live/YouTube, donations and separate backend edge API proof in staging and production.
5. Verify public `church-release.json` has the *canonical* source repo and approved SHA, plus stable PC/mobile/rollback proof; only then classify old repo legacy and begin offsite backup, credential/trigger retirement and deletion review.

Status: `staged-source-import-tested`; not `cutover-complete`; not `old-repo-delete-ready`.
