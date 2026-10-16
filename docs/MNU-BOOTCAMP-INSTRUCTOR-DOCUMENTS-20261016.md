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


## Official orchestrator convergence (2026-10-16)
- Human-approved immutable source: PR #4925, `d404ee5d1b821fcf7ae5f7342138ce759a56f93a`.
- Issued EKODI release task/branch: `orch_recovery_d404ee5d1b821fcf7ae5f7342138ce75`, PR #4945.
- Approved source SHA remains a parent of the official synchronized branch commit; current main included with no overlapping file edits.
- This documentation-only synchronization checkpoint requests genuine protected GitHub Actions checks. It is not a deploy authorization, CI bypass, production-verification claim, or automatic email-send enablement.
- Require guarded Education staging and first-party Chromium PC/mobile production evidence before reporting completion.


### Genuine Actions replay after GitHub update-branch (2026-10-16)
- The official EKODI converger returned `branch-updated` for PR #4945; GitHub's bot-created synchronized head `cf8225dc31d7d64be009a0eea30fcc1f37d38fd4` produced `action_required` without executable PR test jobs.
- This owner-authored documentation-only commit requests fresh, real GitHub Actions checks on current main ancestry. It does not replace human approval of immutable source `d404ee5d1b821fcf7ae5f7342138ce759a56f93a`, change public UI, bypass mandatory checks, or claim staging/production success.


## Production post-merge Chromium diagnostic and correction (2026-10-16)
- Official owner-approved PR #4925 -> recovery PR #4945 -> guarded merge `08010078504b8f07662451dc4a6c39f44bd0dc47`.
- Guarded Education production deploy run [38823019127](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38823019127) verified the existing Worker hostname, classroom assets, and authenticated boundary, but the final Chromium classroom step failed on the first mobile profile.
- Read-only artifact `ekodi-education-native-38823019127/education-native/result.json` shows zero browser page exceptions, zero HTTP failures, zero unexpected network failures. Chrome 156 reported known, browser-blocked Shell inline styles as `Applying inline style violates ...` and the rejected Cloudflare beacon as `Loading the script ... violates ...` where the existing strict classifier expected only earlier `Refused to ...` messages.
- This correction **does not allow inline styles or external beacons** and **does not weaken CSP**: it classifies only the exact observed directive and third-party beacon prefix as expected rejected resources; any other console, HTTP, script, resource or mutating request remains fatal.
- Extend guarded production-native acceptance to the new lecturer CV/syllabus/photo/email draft page across five widths, including no unauthorized POST, no live email send, JSON/HTML exports, and review-gated MIME draft attachment.
- Production completion requires a new source PR and exact-SHA owner approval, protected integration, guarded Education release and timestamped native Chromium results for classroom, material studio, and document editor.
