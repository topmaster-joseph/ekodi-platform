# EKODI Proposal Studio — Phase A Foundation

- **Canonical path:** `https://ekodi.kr/proposal/` (pending protected release; a branch/PR is not a live deployment).
- **2026-10-16 scope:** a browser-only draft workbench built from the user's 16 ordered proposal-production guidelines, generalized into conditional stages.
- **Included:** eight domain selections (including auto), four purposes, empty evidence-aware sections, key decision fields, TXT/MD/CSV/JSON client-side preview, explicit unsupported PDF/HWPX/DOCX/XLSX conversion, initial completeness review, Markdown/JSON export/import.
- **Excluded / not claimed:** remote AI agent, public policy research, document parsing beyond text, HWPX/DOCX/PDF/PPTX/Excel creation, numerical cross-validation, durable autosave, collaboration, sign-off, transmission, live production verification.
- **Data protection:** no file upload API, no POST, no server persistence; local memory only; HTML uses no inline script; input content is inserted with textContent/value, not innerHTML. Uploaded text remains local to the browser. Client can download a local JSON backup.
- **Scope limits:** <=20 filenames, <=12 file additions at once, text previews <=750 KB source file and <=6K characters; project import <=1.1MB. Previewing does not verify truth or source integrity.
- **Routing:** Site Worker allowlisted `/proposal/`, `/proposal/index.html`, `/proposal/app.css`, `/proposal/core.js`, `/proposal/client.js`. Noindex, no-store, same-origin CSP, no mutating methods.
- **Ownership:** Shared Site asset deployment; no new hostname, OAuth scope, database, production secret or billing setting.
- **Release:** run `node --test test/proposal-studio.test.mjs`, `npm run build`, full mandatory CI, protected PR review and guarded staging. Verify PC/mobile Chromium, open/new/edit/export/import/unsafe input/unsupported file/method denial, and no unexpected network POST. Production status only after authenticated release evidence and a live visit.
- **Future:** EKODI user-authenticated workspace persistence and original-location login return; document ingestion pipeline; governed AI research/drafting; sources and budget math; HWPX and PPTX render/QA. All future write/external action paths require explicit authorization and audit.
