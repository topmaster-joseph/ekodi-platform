# EKODI Education · AI Bootcamp Instructor Document Studio (2026-10-16)

## Canonical route
- Existing Education Worker static subtree: `/study/ai-bootcamp/documents/` (apex alias `https://ekodi.kr/edu/study/ai-bootcamp/documents/`).
- No new origin, database, hostname, API secret, role, or authorization boundary.
- Linked from the existing classroom heading and instructor section.

## Content sources
- Instructor resume: ChatGPT Library, `02_강사이력서_및_소개서_정찬균.docx`, 2026-10-14.
- Proposed syllabus: ChatGPT Library, `01_제출용_교직원_AI교육_제안서.docx`, 2026-10-14.
- Portrait: user-provided Google Drive source `정찬균_기준사진_비자사진.jpg`. **The requested portrait alone becomes part of the publicly served JS asset** and is not an identity card, official certificate, passport scan, or full private résumé.
- Doctoral degree claim verified against `260820목포대경영학박사학위증(정찬균)`; 2026-08-20 completion. Do not upload the certificate or its private identifiers to public assets.
- Existing unrelated personal information is not imported into the static public source. Resume contact field remains blank by default.

## Browser behavior
1. Switch between CV and syllabus, edit fields, see immediate printable A4 previews.
2. Replace JPEG/PNG/WebP instructor photo; image stays in browser memory. The default portrait is the explicitly requested Drive-derived photo.
3. Print/save PDF with browser print dialog. Export standalone HTML with embedded portrait. Backup/import validated JSON (includes photo). No storage, POST, automated publishing or logging of editable content.
4. Specify one recipient and subject. Changes invalidate review checkbox. Confirm; export MIME-correct `.eml` draft with HTML document attachment and portrait MIME part (CV only). `X-Unsent: 1` favors opening as a compose draft where mail clients support it.
5. Alternatively open `mailto:` in user's default mail client. Browser mailto cannot attach files automatically; the user attaches exported HTML/PDF manually. **No server delivery and no claim of successful sending.** Sender controls final transmission.
6. Session-only: leaving/reloading the page discards unsaved edits. JSON backup is recommended. No private persistence.

## Security and acceptance
- Never store OAuth tokens or integrate Gmail send scopes into a public page. Do not publish private certificates, signed forms, ID images, student data or private contact details.
- File input allowlists and upload limits; downsample browser images to JPEG. JSON schema and size checks; no HTML concatenation from unescaped input. No network data POST.
- CSP-compatible external scripts and CSS, `img-src data:` already supported; same-origin routing; preserve original Google Auth return-to-origin behavior.
- Run `node --test test/education-bootcamp-documents.test.mjs`, full `npm test`, static checks and responsive browser testing. Publish only through protected EKODI CI, guarded merge, staging, rollback, and native Chromium PC/mobile checks.
- The PR provides browser-side editing and manual email handoff, **not** authenticated server-side editing, cloud persistence, or direct Gmail sending. Those require a separate authorization/RLS and audited mail handoff change.
