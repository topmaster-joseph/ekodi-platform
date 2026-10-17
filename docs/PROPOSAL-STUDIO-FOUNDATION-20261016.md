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

## Phase B (2026-10-17)

Code now provides evidence-labeled guided drafts, entered-value budget reconciliation, A4 HTML print output, a presentation Markdown outline and Excel-compatible budget CSV. The browser does not invoke an AI model, query URLs, save documents to EKODI cloud, or render real HWPX/PPTX/XLSX. Release remains subject to EKODI Orchestrator receipt and protected live verification.

## Phase C (2026-10-17): in-browser OOXML creation

- Browser-local generated Word DOCX, Excel XLSX with formula-backed budget calculation, and 16:9 presentation PPTX. These create clean new files, not a pixel-perfect import of user-provided templates.
- Bounded dependency-free ZIP packaging, XML character escaping, strict source limits and no external conversion calls.
- CI tests unzip archive entries and parse Office XML with standard Python tools. Passing structural ZIP/XML tests does **not** prove compatibility with every Office or Hancom version; first-party viewer and template integration remain unverified.
- HTML print-to-PDF stays a user browser action. Direct HWPX creation and AI research/model integrations are NOT delivered.
- Production release remains blocked until official orchestrator receipt, policy-owner exact-head Human Gate evidence, guarded protected merge and actual desktop/mobile live validation.


## Official convergence checkpoint (2026-10-18)

- Approved immutable source: PR #5095, SHA `c25df20f429c29eacecacecb4f654892a5b2d731`, policy-owner GitHub approval comment followed by Human Gate label.
- Official task and receipt: `orch_recovery_c25df20f429c29eacecacecb4f654892`, `authorized=true` from first-party EKODI Orchestrator.
- Recovery PR #5119 issued by original `EKODI Release Provenance Auto Recovery` workflow; final deployment remains gated.
- The recovery branch now contains a GitHub-managed protected-base reconciliation commit. On the recovery PR head `6bcb77bc2bbd7fdc84ccc9120818de88385f4297`, dedicated Proposal Studio, EKODI Constitution, Orchestration Gate, CI and staging jobs passed after maintainer workflow approval.
- Later protected `main` advanced independently. This documentation-only checkpoint must be processed through `.github/workflows/converge-orchestrated-pr-merge.yml`: compare current base, update branch via guarded GitHub API, run fresh required checks, merge through official orchestrator, dispatch receipt-bound Site Core deploy and verify `/proposal/` on the real production system.
- No human approval is being claimed for a new executable source SHA; no force-push, direct production modification, or bypass of CI or rollout protections is authorized. If conflict or policy constraints persist, retain the PR open and report the specific unmet gate.
