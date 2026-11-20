# EKODI Office — isolated interface prototype
**Status: NOT DEPLOYED, NOT IN ROUTE REGISTRY, NO NEW DOCUMENT ENGINE.**

Central orchestrator intake: https://github.com/topmaster-joseph/ekodi-platform/issues/9952

This standalone static mock-up studies the landing experience for a future EKODI Office service. It does not claim to be a document editor, an authenticated workspace, or a commercial desktop installer. All existing links go to existing canonical EKODI routes:
- \`https://ekodi.kr/my/docs/\` — personal document editing, including the current docs AI capability
- \`https://ekodi.kr/proposal/\` — proposal studio and document outputs
- \`https://ekodi.kr/edu/\` — educational content
- \`https://ekodi.kr/my/\` — canonical My EKODI

**No network API, no file upload, no account tokens, no local storage, no editing, no server writes.** A keyboard-accessible tablist shows PERSONAL / ORGANIZATION / DESKTOP content, including clear unavailable status for unimplemented pieces. 320/390/768/1440 responsive layout. CSP-safe separate JS and stylesheet.

## Scope and governance
- Do **not** register \`/office/\`, create user/site-admin menu, or promise live launch before central EKODI orchestrator classification and route/capability contracts. No new subdomain.
- Reuse \`core.documents\`/\`ekodi.documents.v2\`, Storage Gateway, existing secure-documents work and existing education/proposal capabilities. No redundant document vault or second identity store.
- For future desktop implementation assess upstream https://github.com/pblsketch/ieumoffice (Apache-2.0) and https://github.com/genspark-ai/genoffice; separate GenOffice \`ee/\` license; preserve LICENSE/NOTICE, third-party notices and modification statement; do not use their trademarks/logo.
- Browser features and desktop features differ: never label HWP import as lossless roundtrip without tested proof; never say native XLSX/PPTX editor already runs in the web portal.
- Tenant authority is server-confirmed immutable workspace_id and membership/capability; platform admin rights are not automatically site membership. User-approved synchronization only; avoid unconsented AI extraction and credential handling.
- Official path: source branch → task/receipt gate → checks/review → guarded staging → deployment → production hostname + real UI acceptance. This prototype is a developer candidate only.

## Local smoke test
Open \`index.html\` locally, check all links and the three keyboard tabs. Automated static contract test: \`node --test test/office-hub-prototype.test.mjs\` from repository root. No production route or access claims are part of these tests.
