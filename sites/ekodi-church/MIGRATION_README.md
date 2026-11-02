# Church source snapshot (shadow import)

Source code and static assets are copied from topmaster-joseph/ekodi-church at SHA 520d4f2daf7e5e4dc53bf928c9df626b5f896600. All 216 tracked files, including original GitHub workflow YAML for native-test provenance, were imported. Nested workflow files are inert: GitHub Actions executes only workflows under the repository-root .github/workflows directory.

IMPORTANT: This is not an operating source migration and is not used for production releases. The independent Church repository and Pages release remain authoritative until a separately approved, validated source transition with matching release provenance and rollback tests.

This directory has a full tracked-file Git blob SHA manifest at source-import-manifest.json. Verify the Git hashes of all tracked files against their manifest entries, run church native tests, preserve full Git history backups, and perform signed-in role/browser/regression verifications before cutover.

Subsequent step must update the existing central Church workflow source checkout to canonical platform module with guarded change approval, without changing Pages project, public canonical URL, Church auth, or Supabase API.

Do not delete the old repository until all SOURCE-REPO-RETIREMENT-001 requirements pass, including independent offsite recovery and repository-scoped owner deletion authority.

Task: church-source-shadow-import-20261102 | Parent issue: #7575