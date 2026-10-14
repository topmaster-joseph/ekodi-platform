# 국립목포대학교 교직원 AI부트캠프 · 에코디교육 연동

Task ID: mnu-ai-bootcamp-20261014
Agent: chatgpt
Surface: existing EKODI Education → Study → /study/ai-bootcamp/
Classification: reversible content/UI extension (not a new platform, workspace, database, authorization realm, or service).

## Scope
- 120분 × 4회 × 6세트 = 24회/48시간: 제안안, not yet a confirmed schedule.
- Lecture: 4 sessions with objectives, agenda, demo, discussion, and 9-screen browser presentation per session.
- Practice: sample text, copyable prompts, hands-on steps, verification checkboxes and offline alternatives.
- Materials: synthetic CSV, rubric, printable outlines, 24-session CSV export.
- Operations: batch A-F by role; dates intentionally unassigned.
- Instructor: public professional summary only, private résumé/proposal and evidence not bundled with public assets.

## Source artifacts retained outside public site
Original editable training package saved 2026-10-14 in the ChatGPT Library folder: /목포대_AI부트캠프_교직원교육_2026/
1. 01_제출용_교직원_AI교육_제안서.docx
2. 02_강사이력서_및_소개서_정찬균.docx
3. 03_강사용_4회차_운영매뉴얼.docx
4. 04_참가자_실습워크북.docx
5. 05_6세트_24회_운영및평가표.xlsx
6. 06_가상_교육운영데이터.csv
7. 07_4회차_강의용_발표자료.pptx

IMPORTANT: binary DOCX/PPTX/XLSX sources are NOT in public GitHub / Worker assets. The public site contains the text-based lesson and 36 presentation screens, not the original editable files. Use only an authorized access-controlled asset library for private documents.

## Security and design
- Education Worker strict CSP and auth remain unchanged. Same-origin CSS and JS only.
- No participant database, grades, real attendance, or automated certificates.
- All demonstration data are fictional and prominently labeled as such.
- No persistent student identifiers or browser storage, no automatic email/system writes.
- Instructor private contact/credentials/certificates are not published.

## Acceptance checklist
- Parse and test static JavaScript catalog and classroom files.
- Verify 4 × 6, 120 minutes, no private contact leaks, same-origin resource links, presentation keyboard interactions and CSV.
- Visual PC/mobile at 320/390/768/1366/1440 widths; tables scroll inside their containers.
- Protected checks + isolated staging via existing Education deploy workflow.
- Production on canonical /study/ai-bootcamp/ (relative to the existing Education service): page is real course (not app fallback), 4 sessions, 6 groups, six categories, presentation, copy, CSV, no console or network errors.
- Regression: Education home, Admission, Study, Shell, auth and existing security stay intact.
- EKODI-native browser first, no paid external browser automation.
- Do not claim production completion without timestamped functional and browser evidence.

## Rollback
Revert course subdirectory and Study link through guarded PR; there is no schema/data migration.

## Supreme-attribute impact
All 21 Supreme Attributes assessed: static local assets preserve independence, replaceability, modularity, standards, simplicity, economic sustainability; nested existing boundary preserves interoperability and consistency; synthetic-only inputs preserve security, data sovereignty and agency; responsive UI and six role groups support collaboration, adaptability and creativity; additive structure and rollback support agility, evolvability, reversibility and resilience; tests, deployment gates and native browser evidence support observability, verifiability and governed autonomous operation; no new backend is introduced and static rendering supports scale.

## Protected release recovery evidence (2026-10-14)
- Source PR #4688; owner-approved source SHA: 08f0272aefb8910b6d5c5b2578160cf072cda41b.
- Human approval comment #6167074209 with exact-SHA approval marker and release-provenance label.
- EKODI-issued recovery task: orch_recovery_08f0272aefb8910b6d5c5b2578160cf0.
- Official recovery branch: ai/chatgpt/orch_recovery_08f0272aefb8910b6d5c5b2578160cf0; integration PR #4689.
- This documentation-only continuity update restarts checks under the existing provenance receipt without modifying classroom behavior, security, auth or release rules. Production still requires all protected checks and native browser proof.

- After EKODI orchestrator synchronized branch at 5302f71c36198b54f9bcf2176633f3be0830f964, owner-authored docs-only continuity refresh requests new GitHub checks on the synchronized code. Exact source approval and receipt unchanged; no gate bypass.

## Education final-gate provenance (2026-10-14)
- Human-approved immutable source: PR #4691 @ 83060c08d19a469dce5bca0418e018720326fb1a, approval comment #6167763300.
- Official orchestrator recovery PR #4693 on branch ai/chatgpt/orch_recovery_83060c08d19a469dce5bca0418e01872.
- Re-run all protected checks and isolated Education staging from this official provenance. Do not bypass CSP, authentication, domain and privacy restrictions. Production remains contingent on protected merge, existing deployment gate and native Chromium evidence.

- After official base synchronization at 8592c6a058a8c1bf1e45eb48beb4803450411033, re-run all immutable-HEAD tests from the orchestrator branch. This documentation-only reconciliation does not relax production gate, source owner approval, Cloudflare Access, CSP or identity protections.

## Instructor material authoring extension (2026-10-14, predeployment candidate)

Requested canonical deep link: `https://ekodi.kr/edu/study/ai-bootcamp/`. The existing Education Worker continues to own the data and assets; the apex `/edu` alias is introduced through the canonical execution registry and shared-site service binding. The previous `/education` alias and independent Education worker hostname remain for compatibility; no DNS or new separate service is created.

### Safe first-stage editing workflow
1. Visit the public AI Bootcamp classroom, choose Instructor → local material authoring studio (under `/studio/`). This is **not** a private admin panel: it only processes files inside the current browser and does not provide a persistent backend.
2. Choose one of four lectures and the intended cohort A–F. Select a local file: TXT, Markdown, CSV, JSON, DOCX, PPTX, or HWPX (8MB source / 1MB extracted XML budget). Office/HWPX imports extract text, not binary images, tables, layout, speaker notes, animations or embedded objects. HWP/PDF/XLSX conversion happens outside the public browser and must be inspected.
3. The source remains in the disposable browser session; import never auto-publishes. Choose the target lesson field; inspect or redact extracted text; apply to current in-memory draft.
4. Edit title, goals, concepts, teacher demo, practice case, prompt, steps, verification and offline alternative. Preview lecture, practice and all nine presentation screens. No localStorage, cookies or POST upload endpoint is used.
5. Review facts, curriculum, sensitive content, permissions, copyright, source provenance and explicitly tick acknowledgement to export only a structured JSON draft. Export includes reviewed lesson fields and benign source filenames/metadata, not original file bytes. Reimport JSON resets its review state.
6. To publish, submit the JSON draft through the authenticated EKODI review/ChatGPT handoff as new source changes to `catalog.js`. The usual exact-SHA, official Orchestrator, CSP, privacy, required CI, guarded merge/deploy, auto rollback and native Chromium evidence remain mandatory.

### Limitations and safety
- Office/HWPX text extraction is a **best effort** convenience, not a trusted full-fidelity converter. Any parsing failure is reported without sending the file to an external site.
- Regex-based sensitive-data warnings are heuristic, not a privacy certification. Detected likely personal data blocks automatic local field insertion until redacted; reviewers must inspect all output.
- File bodies are not retained server-side and no public web upload is supported. Server-stored private instructor documents and role-based publishing require separate security/RLS/storage implementation and review.
- Course sequence, 120-minute session length and six cohort structure remain intact unless explicitly approved by the program administrator. Drafts cannot modify authentication, environment configuration, protected approval or production status.
- Source/private identity evidence is never bundled into public assets.

### Required acceptance
- Unit test material allowlist, boundaries, lesson/cohort isolation, malicious JSON and ZIP extraction, no private-storage backend, strict 8MB/1MB source limits.
- Canary /edu and /education compatibility with common Auth and Cloudflare CSP.
- Native Chromium desktop/mobile input, editing, lesson preview and export without horizontal overflow or network upload; do not claim until actual evidence is attached.

## Official owner-approved classroom studio recovery (2026-10-15)
- Exact owner-approved source: PR #4712 at 0cdc5a1024ffb17490c73eba6198fb11e6f138e5 (GitHub approval comment #6172868245).
- The official Orchestrator recovery PR #4739 is used for fresh protected CI, shared-site apex /edu route and Education Worker release checks. No direct merge, CI bypass or production success claim is authorized. Both existing guarded Worker release paths and real desktop/mobile verification remain mandatory.
