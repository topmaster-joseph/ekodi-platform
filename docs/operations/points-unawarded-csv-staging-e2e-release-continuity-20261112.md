# EKODI Points pending-claim CSV safety — official protected browser-verification continuation

Date: 2026-11-12 (Asia/Seoul)
Parent: #7778 / #6739
Original worker PR: #9446, source functional SHA `8ca1baaa7824b9cdacae60f6c49713cdd86f71dc`
Official Orchestrator recovery PR: #9448 on `ai/chatgpt/orch_recovery_8ca1baaa7824b9cdacae60f6c49713cd`.

## Previous operating evidence

Member CSV owner-binding and stale dispatch race hardening were protected-merged via #9376/#9423; the correctly pinned My production workflow [43145285476](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43145285476) promoted Worker `7fca9b82-31ed-46a1-9a16-fbe7c095f56b` to 100%. Separate read-only live fetches on internal Workers and canonical `https://ekodi.kr/my/points/app.js` confirmed both `function isCurrentHistoryOwner(snapshot,session)` and `session?.user?.id===snapshot.ownerId`. Runtime `pointsEnabled:false` remained in force.

## Scope of this source-only verification improvement

The EKODI-owned background browser worker adds read-only `assertHidden` and `assertDisabled` actions. A missing DOM target or incorrect state fails the browser run; these actions cannot fetch records, create tokens, click, submit, download or modify server state. The existing development-only member synthetic E2E (desktop and mobile) now verifies **zero ledger history, hidden and disabled CSV export** both before and after a pending evidence claim, with a hard 30-action cap. The synthetic site/member/claim and cleanup remain unchanged; no mock or actual ledger award is introduced.

Original source first-party CI [43148671979](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43148671979), browser contract/runtime [43148671998](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43148671998), and other security/Constitution/virtualization tests are required. These are source checks only; do not substitute them for fresh authenticated **official recovery HEAD** CI.

## Why this non-runtime official continuation exists

The GitHub Actions-issued recovery branch can have `action_required` markers without actual executable checks. This documentation-only, owner-connected update on the first-party Orchestrator-issued branch requests authentic required tests and built-in convergence on the latest protected current-main-integrated SHA. It does **not** create release authority, forge an approval, change branch protection, broaden Cloudflare Access, mutate any database or deploy production. Owner-controlled update-branch syncing is still required if GitHub rejects workflow-file changes.

## Mandatory failure boundaries and future acceptance

- Actual scheduled E2E [43103186497](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43103186497) and [42995922985](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/42995922985) failed **before** fixtures because a partial static Cloudflare Access identity was configured. Existing development environment must supply all three owner-protected secrets `CF_ACCESS_STAGING_CLIENT_ID`, `CF_ACCESS_STAGING_CLIENT_SECRET`, and `CF_ACCESS_STAGING_SERVICE_TOKEN_ID`, or remove the entire static identity through owner review and use the separately approved narrowly scoped ephemeral path. No arbitrary token, wildcard policy, production credential fallback or Access bypass is allowed.
- A later passing real synthetic member desktop/mobile and admin Access E2E, with run-scoped cleanup receipt, remains required; tests passing in source CI are not real browser E2E.
- Backup ACL verification remains blocked by owner-held production `EKODI_STORAGE_GATEWAY_KEY`; no encrypted dump or independently tested restore exists yet. Development DB currently lacks the new two anti-unverified-award CHECK constraints.
- Prod Points economy stays `POINTS_ENABLED=false`, production schema/api absent, no money transfer/donation/points issuance, no owner/finance/security approval implied.

## Completion criteria
Authentic exact-official-HEAD CI and EKODI AI Gate → protected first-party merge → no production worker mutation for this browser-only change → authorized development E2E with complete Access credentials and explicit clean-up. If credentials remain absent, report implementation and CI only, not system E2E completion.
