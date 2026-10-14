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
