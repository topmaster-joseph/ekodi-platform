# EKODI Mall — Korean supplier-search protected release continuation

Date: 2026-11-12 Asia/Seoul. EKODI task #9350. Owner-origin source PR #9468, exact functional SHA `fffad68f8aca507c44507520576b0cb2ce855e44`. Official orchestrator recovery PR #9469, branch `ai/chatgpt/orch_recovery_fffad68f8aca507c44507520576b0cb2`.

## Evidence: live external-search defect

On the canonical production Mall query `/ekodimall/?q=자동 릴 호스`, all four stages rendered. Public official supplier API returned `rights-unverified` with `checkoutReady:false`, so only the official external supplier search link was available. The original supplier URL encoded Korean search terms as UTF-8, which the Domeggook legacy product-search page decoded incorrectly, showing mojibake and falsely empty results. Authenticated Opera browser verified a CP949/EUC-KR encoded query `%C0%DA%B5%BF%20%B8%B1%20%C8%A3%BD%BA` loads the readable `자동 릴 호스` result page and actual listings. This is a navigation-only compatibility fix; no supplier listing was scraped or redistributed by EKODI.

## Functional source and safety

Three Mall-owned files only: `sites/ekodi-mall/assets/home-refresh.js`, `home-refresh.css` and `test/home-refresh.test.mjs`. Browsers invert their built-in EUC-KR decoder for requested query characters, cache converted query strings, fall back to the official vendor homepage for unsupported characters, and optionally offer the user's misspelled hose keyword `호수` as a linked `호스` alternative without changing the user's original input. The executable test asserts CP949 encoding, ASCII, emoji fail-closed, meaning-preserving correction, and absence of obsolete UTF-8 supplier URL.

No keys or PII are included. Supplier public-search gate remains off pending explicit catalog-publication rights plus verified rate limiter; payment scope, supplier auto-order, customer PII forwarding, refund and deposit settings are unchanged. No shopping order or financial action is performed or implied.

## Authentic CI continuity

Authoring source exact SHA passed Mall standalone validation [#43155181542](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43155181542) and complete source CI [#43155181381](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43155181381), including static source/build, and the later ready-for-review source CI [#43155365670](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43155365670) passed. The orchestrator-issued PR had bot-created `action_required` placeholders for the required checks. **This non-executable, owner-connected documentation-only commit is intended to trigger genuine GitHub pull-request CI on the official recovery branch.** It does not forge CI status, change an authorized source SHA, change approval policy, or bypass protected branch rules. The functional source commit remains in the recovery branch ancestry, verified by compare.

The EKODI Orchestrator must validate the new exact recovery HEAD and any latest-main synchronization before protected merge, then the Mall staging/production workflow must report successful release. Finally, a real browser must revisit `https://ekodi.kr/ekodimall/?q=자동%20릴%20호스`, click the official supplier link, and verify a correctly readable Korean search page. Existing Mall direct-sale/Books quote protections must remain intact.

## Vendor points and API blockers

Authenticated Domeggook point-page readback on 2026-11-12: points `0P` after -3,000P and -5,000P expiration records dated 2026-11-09. Separate e-money balance `50,000 KRW` was *not spent or approved as a substitute* for 8,000 reward points. Latest official tech reply dated 2026-11-03 explained `setOrder v4.3` member error may involve `deliinfo`; no newer technical reply was found through Nov 12. An unsent follow-up draft exists, not claimed as sent. Supplier publication rights and business-order authorization remain independent human/vendor gates; no automatic ordering or spending shall be enabled by this release.
