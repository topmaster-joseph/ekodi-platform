# Church canonical candidate with audited source PR integrations

This directory preserves the originally SHA-pinned Church source from topmaster-joseph/ekodi-church at 520d4f2daf7e5e4dc53bf928c9df626b5f896600 (tree 30f2d5396b416aec9aca9773c84710052f4f8c35). The original 208 tracked files and their original Git blob hashes remain attributable to that source; the eight old GitHub deployment workflows remain excluded.

An offline, reviewed integration candidate adds the unmerged upstream changes in order **#143, #144, #142** (not by pretending they were merged into the old main):

- #143 at 9e8fc072d1d6d66286d9a275fe3960e50e5c5e72: retire the redundant homepage Life Hub, keep browser-local saved records untouched, and use the canonical /ekodichurch/devotion/ daily devotional destination with compact responsive hero.
- #144 at b752da0de6520b934b585a1c2a75d8e7af065ac7: add one shared Church footer visit summary without introducing a second analytics backend.
- #142 at 1607bc1c06157c420afabe3bfc62cca9073738c8: add fragment tabs and personal-area quick access. Where #142 still linked to removed #life-hub, resolve links and tests to /ekodichurch/devotion/ instead, without losing member authorization or records.

The integration contains **20 audited upstream changed paths** and four added source files, producing 212 tracked Church files. The reviewedOverlays register in source-import-manifest.json records exact source branch heads, independently calculated PR patch SHA-256 values, per-path upstream blob SHA and final canonical blob SHA. The original base Git blobs are never overwritten in this provenance record. All existing apex URL, CSP, login-return and public/private safety normalizations remain enforced.

This is **not production migration evidence**. The sourceOwnershipTransferred and productionReleaseSwitched flags remain false until the guarded C3 release has been verified. The old Church Pages project, legacy source repository, release workflow, databases, auth, financial and pastoral RLS, domain, secrets and live broadcast remain untouched by this code import.

Next: complete native unit/Chromium 320/390/768/1366/1440 browser, guest/member/admin/live checks, stage the exact content hash, acquire the EKODI Orchestrator protected release receipt, promote to the same independent ekodi-church Pages project, verify live v2 source SHA/digest and rollback, then independently review offsite restorable history and destructive repository retirement. Never delete the legacy GitHub repository from this migration PR.

Task: church-upstream-pr142-144-canonical-reconcile-20261103. Governance: Church #7575, fleet #7502, Constitution 1.27.7.

## 2026-11-06 reviewed stacked source extension — Church #146 → #149

The earlier paragraph describes the **preserved historical 212-file v1 reviewed snapshot**, now stored byte-for-byte in `source-import-baseline-v1.json` and pinned by its original Git blob SHA (`09b01865a3f0ba99caf8b7b97fc787ee8ef83d51`). Its previous reviewed PR #143/#144/#142 source receipts are not rewritten.

The **new 223-file v2 candidate** extends that original review with the exact *open, unmerged* Church source PRs:
- [#146](https://github.com/topmaster-joseph/ekodi-church/pull/146) `b79dc3b19b562f9b654bffb55d797ea336c08d34`, parent `9e8fc072d1d6d66286d9a275fe3960e50e5c5e72`: public Church notices, read-only Church/Mission schedules, compact updates.
- [#149](https://github.com/topmaster-joseph/ekodi-church/pull/149) `b89c32f9330afbd114dc632306a7b9348c869b7b`, parent `b79dc3b19b562f9b654bffb55d797ea336c08d34`: six first-level menu destinations and selected-section navigation with legacy deep-link targets preserved.

The `stackedReviewedOverlays` register in `source-import-manifest.json` records 24 distinct upstream changed paths, 11 newly reviewed source files, both exact upstream Git blob SHAs per path, their previously canonical Git SHA, and the newly committed Git SHA. The pre-existing 212 original Git blob SHA identities remain unchanged. A **separate exact-SHA test-only reconciliation** updates the former eight-tile assertion to the now approved six-menu contract without expanding member or finance permissions. `scripts/verify-reviewed-church-source-v2.mjs` fails closed on an altered baseline, source head, parent, file/mode, missing path, unreviewed change, or claimed release/deletion authority.

The two upstream PRs are **not represented as merged in the old Church repository**. This integration remains a **protected source candidate**, not a Cloudflare staging URL or a production release. `productionReleaseSwitched=false`, `sourceOwnershipTransferred=false`, `legacyRepositoryDeletionAuthorized=false`. Before any C3 change: protected CI, offline source/payload SHA verification, actual isolated staging guest/member/admin/live/finance tests and rollback, owner receipt/flag gate, real Cloudflare Pages v2 marker verification. The old independent Pages project and GitHub repository must remain operational and recoverable until those checks complete.
