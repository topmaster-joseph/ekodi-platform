# EKODI native-brand short-path consolidation — 2026-11-23

## Owner decision
Use the short, unique **public** path after `https://ekodi.kr` for EKODI-owned brands. Keep official names (e.g. 에코디선교회 / EKODI Mission) and separate persistent tenant keys, Auth site identifiers, workspace slugs, API identifiers, database storage keys, merchant account boundaries and telemetry dimensions.

| Public brand | Current legacy public root | Owner-approved short public root | Cutover gate |
| --- | --- | --- | --- |
| EKODI Mission | `/ekodimission` | `/mission` | Mission / Shared Site two-Worker release, auth/board/apply/live/media/e2e probes |
| EKODI Church | `/ekodichurch` | `/church` | Church Pages and Shared Site route ownership; member, board, pastor admin, worship, LIVE |
| EKODI Biz | `/ekodibiz` | `/biz` | Checkout, refunds, agency API, trade, marketing, sensitive admin |
| EKODI Lab | `/ekodilab` | `/lab` | Pages origin, worker projection, lab admin, SEO |
| EKODI Mall | `/ekodimall` | `/mall` | Existing `/mall` -> `/ekodimall` redirect removal; seller/admin/payment/settlement |

Already concise roots `/edu`, `/publishing`, `/volunteer` are unchanged. Customer-owned brands and tenant routes such as `/cgma`, `/jadam`, `/pizzamaru`, `/yogurt` are not renamed.

## Implementation rules
1. **No external HTTP redirects** (301/302/307/308) for the new short path. Route natively inside the service binding or owning Worker, preserving methods and bodies. The legacy path is transitional only until its links, QR codes, bookmarks, OAuth callbacks, search visibility, queue/webhook producers and user-facing navigation are migrated and proven.
2. Mission: `/mission/**` resolves inside SPACE via the existing authoritative `ekodimission` tenant contract. Browser-facing HTML/JS/CSS/SVG references and canonical URLs use `/mission`; do not mutate the `ekodimission` workspace key.
3. Keep read and write ownership at the original Worker. Never bypass authorizer, CSRF, origin, role or payment checks via short-path routing. Do not copy private data between services.
4. Production cutover requires CI, staging native deep-link E2E, Cloudflare rule ownership, `/mission` 200 no redirect, all subpages and linked assets, public/manager access, activity application POST, collaboration, share tokens, media uploads, footer statistics, and LIVE.
5. Advance each remaining root in its own guarded owner-specific release; do not substitute a broad global string-replacement or a catchall redirect. Block full-completion status until all five roots and external links are tested.

## Operational caveats
The Shared Site `assets.run_worker_first` list contains 100 rules. The Mission Worker-first entry uses the slot of the retired `/ekodi-church*` alias, rather than exceeding the Cloudflare limit. The retired alias must not become an independently supported public entry.

GitHub change/PR is **not** proof of deployment. Inspect protected checks, promotion run, service-worker release SHA and real production public/request probes before asserting completion.
