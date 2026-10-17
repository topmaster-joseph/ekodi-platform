# EKODI Research — 1차 구현 상태와 릴리스 체크포인트

Task ID: research-mvp-20261017-0331
Branch: ai/chatgpt/research-mvp-20261017-0331
Canonical planned route: https://ekodi.kr/research/

## Included in source
- Research capability routed through the registered Education Worker, Korean responsive public portal, diagnosis form and project planning workspace.
- Free **rule-based** research guidance (not an LLM, plagiarism detector or verified literature service).
- Working non-sensitive local-only project planning with clear disclosure.
- Optional server-backed project/consultation APIs, fail-closed until isolated D1 and EKODI Supabase verification are correctly provisioned.
- Isolated migration and scoped ownership checks; never infer admin capability from a client-side role.
- Education Worker staging/production validation and Research unit test.

## Explicitly not yet enabled
- Manuscript uploads or private document access.
- Live specialist matching, appointment confirmation, payment or AI model executions.
- New D1 database has not been provisioned and no shared identity credentials have been issued.
- Nothing here is evidence of deployment, operational readiness or real-user verification.

## Migration/activation requirements
1. After reviewed database isolation requirements, provision isolated D1 \`ekodi-research\` and apply \`research/migrations/0001_init.sql\`.
2. Add \`RESEARCH_DB\` binding and approved existing Supabase Auth public URL/key to Research Worker (never the service-role key).
3. Verify Google SSO \`return_to\` restores exact \`/research/\` route; no fallback to \`/my\` or redirect loops.
4. Ensure public signup and consent terms precede production consultation intake. Account owners only read their own projects.
5. Integrate EKODI Storage Gateway for encrypted documents with purpose-bound grants before enabling manuscripts.
6. Integrate EKODI Pay with owner-verification and refund controls only after merchant/settlement validation.
7. Register optional AI modules through the EKODI external AI contract, off by default.
8. Release only through official orchestrator + required CI/review/staging/guarded production workflow. Verify 320/390/768/1366/1440 viewports, protected API and browser flows.
9. Obtain production receipt: exact task, branch/commit, all gates, deployment, production hostname, functional proof, observability, timestamp and independent verifier.

## Guardrail
No hosted data, consultation submission, payment or AI capability may be presented as live until its underlying server permissions and integrations are verified. Public homepage is not a claim of a completed commercial platform.

## Constitutional adjustment: existing capability delivery
Mandatory CAPABILITY-BEFORE-SERVICE-001 requires verified Foundry samples and EKODI Platform Super Administrator packaging review before a new canonical service is registered. Research is **not** independently registered at this stage. The public `/research/` alias uses the existing Education Worker and approved Education release pipeline. Research's UI and domain logic are isolated modules; any future independent service creation awaits genuine required evidence and approval rather than fabricated receipts.

## Explicit feature activation gates
- `RESEARCH_STORAGE_ENABLED=true` is required in addition to an isolated `RESEARCH_DB` and approved Supabase public client configuration. Merely binding a database or reusing Education credentials does **not** silently activate private storage.
- `RESEARCH_CONSULTATION_ENABLED=true` is an additional independent gate before any consultation intake; published terms, contact and fulfillment readiness must be separately reviewed. The front-end will not display the form until this gate and verified login both exist.
- No other feature flag automatically enables manuscript uploads, third-party AI, expert matching or financial transactions.

## Owner-authored GitHub CI regeneration (2026-10-17)
- Human-approved executable source: PR #5091 at `8242c82185650b6abe483f1e043c2f525734f4e2`, with owner-authored exact-SHA approval comment [#6227697586](https://github.com/topmaster-joseph/ekodi-platform/pull/5091#issuecomment-6227697586), followed by the Human Gate label.
- EKODI-issued recovery task: `orch_recovery_8242c82185650b6abe483f1e043c2f52`.
- Official recovery branch: `ai/chatgpt/orch_recovery_8242c82185650b6abe483f1e043c2f52`; integration PR #5121.
- Initial recovery PR checks returned `action_required` with zero executable jobs because the event was created by the GitHub Actions bot. This **documentation-only** owner-authored commit requests normal PR checks on the recovery branch.
- No changes to executable application behavior, authentication, database schema, approvals, guardrails, payment or AI controls. Required CI, isolated staging, protected merge, guarded deployment, rollback, and real PC/mobile production evidence remain mandatory. No deployment or completion is asserted here.

## Post-synchronization owner-authored validation refresh
- Official EKODI orchestration synchronized recovery PR #5121 with current main at `cbd194fa04c4745bf4cb26d04fdfeb00a7082e01` after all checks passed on preceding `71f9da65687c0eb49e36039455d6462da7a92e7e`.
- Synchronization commit checks again showed GitHub bot-created `action_required` status. This owner-authored documentation-only update requests authentic checks on the synchronized immutable source without altering functionality or approval scope.
- Original exact-source owner approval stays PR #5091 SHA `8242c82185650b6abe483f1e043c2f525734f4e2` under the same authoritative EKODI recovery task. Production may proceed only upon verified up-to-date CI, guarded protected merge, Education release dispatch, rollback checks, and real PC/mobile functional verification.
