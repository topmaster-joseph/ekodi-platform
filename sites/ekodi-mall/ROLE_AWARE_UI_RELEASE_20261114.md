# EKODI Mall: administrator vs consumer UI — protected release evidence

Date: 2026-11-14 KST · EKODI AI issue #9709 · source PR #9714 · official orchestrator recovery PR #9717.

## Intended distinction

- Administrator: `/ekodimall/supplier-ops` registers suppliers, verifies contract references and handles seller SKU mapping with server-checked role/allowlist. It is not a consumer purchase page.
- Administrator: `/ekodimall/supplier-connectors` shows official supplier API readiness and *independently approved* public-catalog rights. Explicit permissions and account auth checks remain server-enforced; noindex/nofollow stays.
- Consumer: `/ekodimall/?q=...` exposes ranked public Mall products, approved provider reference *links*, comparison links and AI suggestions, not a privileged supplier admin console.

## Functional diff & evidence

Eight scoped source/test files from original human-directed branch with functional SHA `105368a983ab657ac592b456c4a73466922e22e4`: two Mall supplier-console HTML headings/breadcrumbs, two scoped admin CSS files, customer search CSS, and existing three test files. No JS, payments, D1, worker, credential, supplier API, PII or order change. Displayed badges intentionally retain `권한 확인 전`, `차단` and `OFF` and never imply approval. Both admin pages have links back to shopper interface and role identifiers. Responsive support includes 390/520/560/700/900px layouts.

Source validation: Mall [43484533959](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43484533959) completed success, root CI [43484534228](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43484534228) completed success; EKODI AI Orchestration Gate [43484534053](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43484534053) and parallel change guard [43484534130](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43484534130) succeeded. EKODI orchestrator superseded the source PR with official recovery #9717.

## Protected integration / real checks

Protected `main` advanced while source PR was authored. Official recovery branch was **automatically rebased** on current main at `49a3325f7506e22636553076f4ec35ea6a8b5e38` and now has zero behind commits and eight Mall source/test paths changed. Bot-created PR checks on rebased HEAD `d8dc83c7eb69f6cabe59f2600a9bb6867b322a50` are `action_required` placeholders. This owner-connected, non-executable documentation-only continuity commit on the **existing official recovery branch** requests authentic pull_request GitHub Actions checks. It does *not* forge results, approve policies, alter security decisions, merge or deploy.

Release only after exact current SHA passes required Mall + root + orchestration + security checks, current main ancestry, protected merge, staged Mall API/pages CI, and live browser verification at `/ekodimall/supplier-ops`, `/ekodimall/supplier-connectors?tab=gates`, `/ekodimall/?q=자동%20릴%20호스`. If a later main commit appears, re-evaluate ancestry and conflicts without blindly overwriting other changes.

## Financial safety

Do not enable vendor public catalog search (current `rights-unverified`), payment expansion, buyer PII transfer, actual order, automatic fulfillment or e-money consumption. The external support email is an already-sent read-only licensing inquiry, not permission to sell.

## Owner-connected second authentic CI request after protected-base refresh

The EKODI orchestrator refreshed protected base to `39aae6c23e8db8e3ed4b0b2c2bddec52df040274` and recovery head to `c582df0f3b4c19f6554ab68c41afdad5240d8fd0` with zero behind commits. Previous human-connected recovery commit `6889f9310d747d89961c72e1c0e3e1686d2eb78e` passed real Mall validate 43485287166 and full root CI 43485287031 (both success), plus orchestration and conflict guard. The newly bot-authored refresh has `action_required` check placeholders and requires **new authentic checks on this exact head**. This non-functional documentation note is another owner-connected PR event solely to request real CI; it neither changes authorization nor substitutes previous green results. No store or admin backend changes were made. Complete protected merge only after exact new head passes the gates and actual Mall stage/production verification.
