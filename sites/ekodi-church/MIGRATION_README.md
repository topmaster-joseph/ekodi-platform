# Church canonicalized shadow source

This is a NON-DEPLOYED staged import of upstream repository topmaster-joseph/ekodi-church at source commit 520d4f2daf7e5e4dc53bf928c9df626b5f896600.

The upstream commit contained 216 Git-tracked files. Eight historical .github/workflows files are excluded from the module because their old host references and write workflows are inappropriate for canonical EKODI. The other 208 files are retained, with five minimal path and test wiring adjustments to obey canonical apex URLs and preserve centralized authentication and protected releases.

See source-import-manifest.json: each file stores its original Git blob SHA; the five changed files also store normalizedBlobSha. This ensures that the exact upstream history remains provable without publishing obsolete subdomain URLs into a new operational source tree. Original full-history Git bundles are stored independently on authorized user2 and user3 devices, with ref-level restore tests.

IMPORTANT: This folder is NOT the live Church release owner. Current Church Pages deployment continues to check out topmaster-joseph/ekodi-church; no auth, domain, Pages, Supabase or API change was performed.

Next cutover requires an independent C2/C3 guarded migration to change the existing central Church source checkout and provenance marker, synthetic PC/mobile guest/member/admin/live smoke and rollback tests, safe old automation retirement, and per-repository irreversible deletion proof.

Task church-source-shadow-import-20261102 | EKODI Orchestrator issue #7575