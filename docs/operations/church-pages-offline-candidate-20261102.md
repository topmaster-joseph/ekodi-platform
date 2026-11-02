# Church Pages artifact candidate: canonical source, independent release

Task: `church-pages-candidate-build-20261102` · Source consolidation track: #7575 / #7502.

**Status: offline artifact preparation verified on two authorized devices. Production release contract and Cloudflare source switch NOT changed.**

## Principle

EKODI-owned website source lives in the canonical platform repo. The **deployment target remains the independently guarded `ekodi-church` Cloudflare Pages project**, with its own version and rollback. A source folder is not a release unit, and staging an artifact is not authorization to publish it.

## Reproducible candidate

Run from the repo root:

```sh
node scripts/build-church-pages-candidate.mjs \
  --source sites/ekodi-church \
  --output /tmp/church-pages-new-candidate \
  --sha "$(git rev-parse HEAD)"
```

The script refuses existing output, requires the exact 40-character platform commit SHA and the Church source provenance manifest, verifies each published file's Git blob hash, excludes all tests/CI/repository metadata, and writes a *candidate-only* `church-release.json` with:

- `contract: ekodi.church-release.v2`
- `sourceRepository: topmaster-joseph/ekodi-platform`
- `sourceModule: sites/ekodi-church`
- `sourceSha: <exact platform commit SHA>`
- `upstreamSourceRepository: topmaster-joseph/ekodi-church`
- `upstreamSourceSha: 520d4f2daf7e5e4dc53bf928c9df626b5f896600`
- `payloadSha256`: deterministic hash of sorted asset paths and per-asset SHA-256 digests

The builder never connects to Cloudflare, creates a GitHub release, alters the active site or claims release authority. CRLF conversion from Windows checkout is reversed **only when the resulting bytes exactly match the committed Git blob hash**; otherwise build stops. Security headers `_headers` are preserved.

## Evidence: independent user2/user3 artifact reproduction

- Task branch source commit: `22dc8249b6c940940abaf5a545a9f02a76c8d450`.
- Source imported: 208 Church files, 8 obsolete GitHub workflow files excluded; 13 canonicalized paths retain original and normalized Git blob hashes.
- Both user2 and user3 independently ran the candidate builder against the same GitHub branch in isolated checkouts.
- Each build contains **143 deployable source files + one release marker (144 total)**.
- Both reported identical candidate payload SHA-256: `569eca9c36ff58b8b774a042009f86a7853be892ad8c18eb271fb34841ce5aaa`.
- Automated mock tests: **6 passing on user2**, additionally verified on user3.

## Exclusions and pre-production gates

No GitHub Actions workflows, local `.env`/secrets, tests, package/build scripts, source manifest, internal migration README or npm cache are included as public static assets. This is a *candidate*, not an uploaded Pages deployment or a staging production-parity browser run.

Before changing the current Church release workflow:

1. Approve the constitutional C2/C3 source-owner/release-provenance transition under EKODI Orchestrator authority, retaining the same Cloudflare Pages project and release rollback history.
2. Integrate the exact platform SHA into the protected Church release receipt and the separate existing Pages workflow; do not silently replace the live Church repo SHA with a new value.
3. Run real staging and synthetic guest/member/admin/Live/browser/PC/mobile checks including church-pastor-api/Supabase Edge independent release state, login return_to, finance separation, pastoral role scoping and rollback.
4. Promote only after protected CI and explicit Orchestrator receipt; verify the real canonical public release-marker v2 matches the exact deployed platform source and approved payload.
5. Preserve the old repo until offsite immutable backup restore, disabling old workflows/tokens and repository-specific owner deletion review has passed.

Current deployed production marker remains `ekodi.church-release.v1` backed by the independent Church source, **not v2**. No deletion was done.
