# EKODI Research — 1차 구현 상태와 릴리스 체크포인트

Task ID: research-mvp-20261017-0331
Branch: ai/chatgpt/research-mvp-20261017-0331
Canonical planned route: https://ekodi.kr/research/

## Included in source
- Standalone Research Worker, Korean responsive public portal, diagnosis form and project planning workspace.
- Free **rule-based** research guidance (not an LLM, plagiarism detector or verified literature service).
- Working non-sensitive local-only project planning with clear disclosure.
- Optional server-backed project/consultation APIs, fail-closed until isolated D1 and EKODI Supabase verification are correctly provisioned.
- Isolated migration and scoped ownership checks; never infer admin capability from a client-side role.
- Dedicated staging/production Worker configuration and smoke/unit test.

## Explicitly not yet enabled
- Manuscript uploads or private document access.
- Live specialist matching, appointment confirmation, payment or AI model executions.
- New D1 database has not been provisioned and no shared identity credentials have been issued.
- Nothing here is evidence of deployment, operational readiness or real-user verification.

## Migration/activation requirements
1. Provision isolated D1 \`ekodi-research\` and apply \`research/migrations/0001_init.sql\`.
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
