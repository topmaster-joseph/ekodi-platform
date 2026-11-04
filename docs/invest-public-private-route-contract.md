# EKODI Invest Canonical Public / Private Routing

Task: invest-public-private-rebased-20261104. Rebased on main after centrally merged compatibility tests #8086 and #8088.

## Routes
- Public: /invest and existing public /invest/* informational services (including /invest/analysis).
- Private: /invest/my and /invest/my/{manual,broker,market,portfolio,autopilot,auto-policy,live,strategy,value,design,scenario,risk,reports}.
- Private static/client assets: /invest/my/app.js and /invest/my/style.css.
- Private owner-check API: /invest/my/access, with unauthenticated 401 and non-owner 403.
- Legacy /my/invest[/*] and /invest/personal redirect (308) to the appropriate /invest/my path.

## Deployment order and safety
1. Validate all source lint/tests on a clean branch against latest main.
2. Stage MY service worker first, then stage Shared Site router with MY service binding.
3. All private routes must be delegated to MY, not accidentally fall through to public Invest content. Missing binding: fail closed 503.
4. New anonymous private pages show only login guidance. Owner sidebar and all private sections stay hidden until server-verified owner. Extra step-up is required when configured.
5. Login via site=invest preserves the exact /invest/my path and query and uses an origin-scoped safe return. One-time handoff fragment never appears in query parameters.
6. After validation display no top header, no account link, and one 14-item left sidebar. Owner identity button is at its top.
7. Menus directly select specific subpage paths via history.pushState. Browser back and deep-link refresh must work.
8. Real brokerage orders remain locked. Manual order form creates a draft only; AI uses paper simulation subject to existing safety policy.
9. Production requires centrally approved recovery PR, protected merge, both Workers deploy, and real host/browser verification. The AI worker must not self-merge or self-deploy.

## Cross-check
Reject conflicting prior Invest UI PRs #7993, #8016, #8020 and legacy #5745 unless explicitly reconciled. Old main-line test assumptions have already been addressed in centrally merged #8086 and #8088.

