# EKODI Invest public/private route contract

Task: invest-public-private-route-20261104

## Canonical paths
- Public Invest landing: /invest
- Public Invest analysis guidance: /invest/analysis
- Private Investment owner home: /invest/my
- Private Invest pages: /invest/my/{manual,broker,market,portfolio,autopilot,auto-policy,live,strategy,value,design,scenario,risk,reports}
- Private assets/access: /invest/my/{app.js,style.css,access}
- Legacy personal URLs /my/invest and its assets redirect to /invest/my; /invest/personal redirects to /invest/my.

## Security and navigation
- Shared Site Core serves public Invest routes and delegates private /invest/my requests to existing MY service binding. On missing MY service binding, fail closed with HTTP 503; never show public investment analysis for a private URL.
- MY Worker retains existing verified-owner JWT and step-up requirements. Auth state is checked before showing private panels. Login alone never enables broker live orders.
- Anonymous views must show minimal explanation and login only; left sidebar and private panels remain hidden.
- Verified owner waiting for step-up receives left-sidebar identity button, but not the owner panels.
- Owner after step-up sees 14 direct sidebar functions and no duplicate top header, account links, or secondary tab navigation.
- Direct detail paths survive reload. Sidebar clicks use pushState and browser back/forward uses popstate.
- Login target uses Invest realm site=invest with exact same-origin /invest/my/detail path and query; identity one-time fragment is consumed only by the private client and never put in query strings.
- Owner manual draft never creates a real order. Existing live-order lock remains.

## Production verification
1. Public pages open anonymously.
2. Private pages return minimal owner login view without personal data.
3. Anonymous private access API returns JSON 401 and private no-store; nonowner 403.
4. Legacy /my/invest paths redirect safely to /invest/my with relevant subpath.
5. Owner login from /invest/my/value?year=2025 resumes at that exact path/query after step-up.
6. Validate desktop/mobile widths 320, 390, 768, 1366, 1440 px, back/forward, keyboard and no JS errors.
7. Both Shared Site and MY Workers require successful guarded staging/production release, not just source merge.
8. Never merge stale PRs that undo canonical route split. Review open UI conflict PRs 7993, 8016, 8020 and old Invest PR 5745 centrally.

## Rollback
Keep the old /my/invest redirect until new canonical route is validated, and use only the EKODI orchestrator's signed rollback procedure for site/service releases. Do not enable real trading as part of rollback or cutover.
