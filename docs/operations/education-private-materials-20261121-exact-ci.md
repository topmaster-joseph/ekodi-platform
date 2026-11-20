# EKODI Education · public course metadata isolation — exact-head CI checkpoint

Date: 2026-11-21 (KST)

## Official release lineage

- User task: continue the existing EKODI Education course/teacher/learner platform under the central EKODI orchestrator.
- Source PR #9996 (superseded), official recovery PR #9997 (this branch), source task `edu-role-data-isolation-20261121`.
- Existing root direct path policy: `https://ekodi.kr/edu/...` only. **No 301/302/307/308 redirects; malformed `/edu/edu/...` stays rejected**.
- Full source-head tests passed on `3e83ca6e4196c90ffc4d1ab97d391ab4601b18b3`: Constitution, Security, CI regression suite, Orchestration, Provider Control, Parallel Conflict, Supabase Local, Education isolated staging and Zero Subdomain Guard.
- The automated protected-main branch synchronization advanced the official recovery branch to `95fa980db1cd914f726acfd7ae19b0f0101eefe8`; bot-generated checks reported `action_required`. **Those checks do not count as passing for the newest head**.

## Current verified source behavior

1. `/courses/catalog.json` is a public, explicitly allowlisted read endpoint returning only 6 unique course IDs with subject/audience/syllabus, student tools and permitted public relative URLs.
2. `/teach/catalog.json` is a server-authenticated teacher-only read endpoint. Unauthorized requests receive 403 and no owner-only identifiers. Verified instructor/super-admin receives the original canonical course metadata.
3. Public `/study/cold-safety-2026/` no longer embeds the owner-private Google Slides document or displays owner-only PPT/Drive IDs; it links directly to the learner presentation and instructor login screens.
4. The original private source metadata remains one canonical record under the existing Education catalog, and Google Drive sharing settings remain unchanged.
5. The authenticated teacher role is never inferred from client state or a shared password; the existing central identity and verified email allowlist apply.

## Release acceptance and limitations

- Rerun genuine protected CI on the **exact latest official recovery HEAD**, not stale source results.
- Protected review/merge; isolated staging; guarded Education production deployment.
- Actual `ekodi.kr/edu/courses/catalog.json` must contain no `googleSlidesId`, `sourceUrl`, `editUrl`, `ownerFolderUrl`, `teacherTool` or original document ID. Public catalog still has 6 distinct course entries.
- `ekodi.kr/edu/teach/catalog.json` without an authorized teacher cookie must return 403. A legitimate teacher's full-material access must retain the existing Google file permission check; do not invent or bypass accounts.
- `ekodi.kr/edu/study/cold-safety-2026/` must expose no Google document IDs and keep teacher/student links.
- EKODI-owned Chromium native production checks: five viewport widths, course links, non-admin privacy, role separation.
- Do not claim production success without the guarded release receipt and real-browser evidence.

This documentation-only owner checkpoint exists solely to retrigger real CI after protected branch synchronization. No runtime credentials, access grants, routing changes, new infrastructure, or direct production action are introduced.

## Protected synchronization checkpoint 2

- Genuine exact-head CI and Education isolated staging were successful for `289f4191d4ae76504488355da01acfa659162ac1`, along with all constitution/orchestration/security/parallel required gates.
- The orchestrator subsequently synchronized the branch to `51ff78dace2d6fde8eb8c335454729515241fa8e` after main advanced. Its bot-issued checks reported `action_required`, which do **not** certify the new head.
- No permission changes, source edits or shortcut deployment are authorized. Revalidate this author-authored documentation-only updated official head and merge only via the governed EKODI Orchestrator.
