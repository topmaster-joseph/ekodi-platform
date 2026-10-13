# LANG-UI-001: authoritative D1 publication fail-closed recovery

## Official provenance
- Original owner-approved source PR #4530, exact SHA `2798413851f66a83d2719580a7644557a28bccc6`.
- Human Gate: https://github.com/topmaster-joseph/ekodi-platform/pull/4530#issuecomment-6135276763
- EKODI D1-issued Orchestrator task: `orch_recovery_2798413851f66a83d2719580a7644557`.
- Official branch: `ai/chatgpt/orch_recovery_2798413851f66a83d2719580a7644557`, initially verified at exact source SHA.
- Canonical protected integration: PR #4531.
- Official recovery run #38327466290 created the branch but its Actions token could not create a GitHub PR (HTTP 403). Connected repository owner opened #4531 on the **same issued branch**.
- Original PR #4530 was closed unmerged. Related-change cross-review is recorded in PR #4531 comment #6135299625. No duplicated source implementation is deployed.

## Safety defect and remediation
The public language status API previously returned static `config/language-registry.js` multilingual defaults if D1 publication state was unavailable. Client Shell hid the selector only on non-200, so this **200 fallback** could render an unverified language as published.

New authoritative behavior: missing/throwing D1 or incomplete/duplicate/unsupported publication rows return HTTP 503 with `language_readiness_unavailable`, cache-control no-store and only Korean fallback. Complete valid per-service D1 state still drives existing 200 published locale result. No catalog, stage, translation publishing, account or security mutation.

Regression: `test/language-automation.test.mjs` tests genuinely published D1 locales and all failure cases. Source CI #38327431925 is successful. Production-bound source branch #4530 rightly failed Control API release guard because it is not `ai/<agent>/orch_*`; this official branch uses the real D1 receipt and must pass all protected guards.

## Guarded release acceptance
This documentation-only owner evidence commit activates existing `converge-orchestrated-pr-merge.yml` for the issued branch. It does **not** bypass release quotas or protected main. Before declaring production fixed, require the guarded Control API deployment and a read-only first-party Chromium status/DOM check. Do not publish unvalidated translations to manufacture a multi-language test.

Keep issue #4365 open until independently observed public HTTP-200 `publishedLocales` includes >=2 and the matching accessible rounded header selector is visible with exactly those options.
