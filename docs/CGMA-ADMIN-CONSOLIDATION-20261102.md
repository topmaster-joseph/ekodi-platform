# CGMA admin consolidation — staged plan (2026-11-02)

Task: cgma-finance-admin-20261102
Base: topmaster-joseph/ekodi-platform main 3b243562f13d5b597c5e742a4873ebf604f6f24f
Legacy source: topmaster-joseph/cheonggye-market main a93212cd55930f02326480f10579307a39a47a6c
Target: https://ekodi.kr/cgma/admin
Legacy: https://cgma.or.kr/admin
Public website: https://cgma.or.kr (keep)

## Migration inventory — do not cut over before authorization, parity and rollback checks

| Menu | Authoritative source / persistence | Existing API | Authorization boundary | Migration check |
|---|---|---|---|---|
| Member application approvals | Supabase access-api and membership-api; optional D1 cgma_merchants synchronization | functions/v1/access-api/pending, /review; membership-api/pending, /review; /api/merchants | Supabase tenant=cheonggye reviewer + site=cgma; do not conflate with Google Sheets roster | Pending counts, reviewer role, approve/reject, sync partial failure |
| Festival booth selection | Supabase cgma-festival-intake | /api/festival-booths-admin or Supabase functions/v1/cgma-festival-intake/admin/* | Tenant reviewer, member verification, max five selected | Read, verify, reject, 5-limit, audit |
| Merchant operations and control tower | Legacy Pages D1 cheonggye_market_notices | /api/merchants, /api/admin-store-health, /api/admin-market-interventions | cgmaAdmin(request) checks Supabase membership-api reviewer | Dashboard metrics, 7-day interventions, explicit human decisions |
| Parking petition/consent | Legacy Pages D1 cgma_parking_petition | /api/parking-petition?include_entries=1 | cgmaAdmin, private entry list | Read 500 max, private no-store, PII restrictions |
| Intellectual property archive | Legacy Pages private document definitions and share state | /api/ip-archive, /api/ip-share, /api/ip-shares | cgmaAdmin; tenant:cheonggye scoped, no public links | Admin retrieval, share expiry, revocation |
| Language publishing | Central EKODI i18n service | EKODI central i18n administrator API (canonical apex path; no external subdomain) | Bearer, service=cgma, editorial review gating | Published/hidden gating, source invalidation |
| AI education surveys | Legacy Pages D1 cheonggye_market_notices | /api/ai-education-stats, /api/ai-education-share | Contacts require extra admin entitlement, anonymous exports | Counts, contact separation, max 6-month retention |
| Merchant directory + resource management | Legacy Pages D1 cgma_merchants / cgma_resources | /api/merchants, /api/resources | cgmaAdmin, public/hidden separation | CRUD parity, rollback, no duplicate data copies |

The EKODI canonical roster at /cgma/admin/member is a distinct Google Sheets-backed **existing-member list**, not a replacement for the Supabase member *application-review* workflow.

## Cutover sequence

1. Freeze an API/source/role inventory per menu. Do not copy D1 or Supabase records into a common tenant by convenience.
2. Establish same-origin server-side bridge/adapters on ekodi.kr, preserving bearer session validation, tenant scope, method restrictions, CSRF and no-store. Reject arbitrary upstream URL requests.
3. Add native /cgma/admin menu modules with dedicated routes and per-menu server permission guards. Keep the existing EKODI workspace admin shell, not a second nested admin.
4. Test read/write contract, error paths and mobile/desktop UI using isolated fixtures; compare with the old admin without destructive production writes.
5. Release through the normal AI orchestration / recovery PR and Site Core verified deployment.
6. After each migrated menu passes actual authenticated production E2E, redirect the legacy menu route. Redirect /admin itself **last**; keep cgma.or.kr public content and canonical domain intact.
7. Retain rollback switch and D1/Supabase read-only shadow probes. No change to tenant IDs or financial authority.

## Phase status
- Inventory and sources: verified from both latest main trees.
- Finance common three-tab interface: code change in this isolated worktree; deployment unverified.
- Legacy-menu API bridge and native modules: **not yet implemented**.
- cgma.or.kr/admin redirect: **not enabled**, because it would prematurely hide unported duties.
- Authenticated production parity: **confirmation required**.
