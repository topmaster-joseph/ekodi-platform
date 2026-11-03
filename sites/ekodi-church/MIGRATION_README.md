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
