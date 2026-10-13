# LANG-UI-001 Control API authoritative publication release boundary

## Provenance and exact approval
- Source: owner-approved PR #4533, exact SHA `51db5eb104280dd9e69b56f176c2f93187645124`, Human Gate https://github.com/topmaster-joseph/ekodi-platform/pull/4533#issuecomment-6135354040.
- EKODI D1-issued Orchestrator task: `orch_recovery_51db5eb104280dd9e69b56f176c2f931`.
- Official recovery branch `ai/chatgpt/orch_recovery_51db5eb104280dd9e69b56f176c2f931` issued at the same approved SHA.
- Recovery workflow #38327963392 received GitHub Actions PR-create HTTP 403. Authorized repository owner connector opened canonical integration PR #4534 on the unchanged issued branch. Source #4533 closed without merging.

## Missing deployment owner
Protected source change #4531 had already merged with exact commit `a98042eb3ee6ebe0087cb42e2029a6179a16b518`, changing `language-automation.js` to prevent registry-defined languages from being published in an API response when D1 availability or publication state cannot be proven. But the existing Orchestrator Control API release dispatcher omitted that module from `controlApiTouched`, and GitHub Actions merges do not trigger main push workflows.

This change adds all three Control API imported language authority files to the **existing receipt-bound Control API deploy allowlist**:
- `language-automation.js`
- `config/language-registry.js`
- `config/managed-language-sites.js`

The corresponding official deployment workflow already owns these sources in PR/main-push rules, and this patch adds a regression test proving Orchestrator dispatch and verified receipt inputs.

## Acceptance requirements
This documentation-only owner commit requests official `converge-orchestrated-pr-merge.yml` for the original D1-issued branch. Do not bypass branch protections, security checks, quota/429 stop conditions or translation validation. Only a protected merge, verified Control API staging/production release and post-release read-only runtime check can confirm live D1 outage fail-closed behavior.

Actual source Korean-only service tests must remain valid. Do not mark entire multilingual UI certified until a real public 2+ language page is observed by EKODI-owned Chromium. Open tracking issue: #4365.
