# EKODI user-facing footer wording release — 2026-11-22

Owner decision: remove nonessential `운영주체`, `운영 주체`, `대표`, `대표 홈페이지`, `대표전화` wording from site footers. Keep factual public identities, phone numbers, registration and postal details, actual seller and tenant boundaries.

## Reviewed sources

- Actual Church homepage/source (independent `topmaster-joseph/ekodi-church#194`) protected merged and published via guarded `ekodi-platform#10152`: five Church pages live no duplicate owner or representative footer rows, verified with native Chromium, 41/41.
- Central shared footer, EKODIBIZ six languages, Books and Publishing 20 generated pages, Mall seller public information and Church history via merged `ekodi-platform#10144`; Cloudflare deployments succeeded for Shell, Biz, Books, Publishing, Mall and Church History.
- Remaining post-release live discrepancy: shared site-chrome public disclaimer still said `사이트 운영정보 및 별도 정책은 해당 사이트의 운영주체를 기준으로 합니다.` on `/ekodimall/` and static `/history`; Books phone title was `대표전화`, and root legal footer prose still contained a nonessential `운영 주체` and `대표 홈페이지`.

## Follow-up `footer-final-wording-20261122`

1. `config/site-chrome-defaults.js` and `history.html`: legally useful precedence notice becomes `각 서비스의 약관·개인정보·환불 정책은 해당 서비스의 별도 고지를 확인해 주세요.`.
2. `index.html`: root footer context explicitly refers to service-specific legal notices; removes promotional `대표 홈페이지`. **Merchant disclosure's legally required `대표자명` and actual person name remain**.
3. `scripts/site-chrome.mjs` regenerates 10 Books footer copies with `전화 010-3501-8542` (no `대표전화`) without changing business registration, seller name or phone number.
4. Exact regression tests in `test/footer-identity-label-free-20261122.test.mjs` and `test/site-chrome.test.mjs` pin each source/content contract.

## Release acceptance

- Authentic EKODI AI-ORCHESTRATE-001 protected CI, official recovery branch, merge and guarded Site Core + Books pipeline. No direct production updates, unaudited redirect or browser tabs.
- On real canonical `https://ekodi.kr/ekodimall/`, `/books/`, `/history`, `/`: footer has no decorative owner/representative titles. Existing mandatory merchant identity notice continues to show registered representative's legal label and name in the dedicated commerce disclosure.
- Verify public HTTP 200, correct links, no loss of phone, legal registration or privacy/terms policies. Document exact runs, SHAs and any unmet gates in this release issue/PR.

The terms in technical documentation and legitimate body text describing tenant independence are not user-facing footer titles, so should not be blindly deleted.
