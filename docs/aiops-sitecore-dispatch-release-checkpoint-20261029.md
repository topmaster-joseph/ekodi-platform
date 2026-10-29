# EKODI AI Ops · Site Core guarded release checkpoint (2026-10-29)

## Origin and immutable functional change
- Owner request: simplify `https://ekodi.kr/admin/ai/aiops` into five progressive views with actual status evidence, compact one-line site list and selectable details.
- UI source: PR #6669, immutable source SHA `279b25f286681b1aefd48f2270534ac642ae3079`, orchestrator recovery PR #6670.
- Site Core deployment ownership gap: `ai-ops-admin.js` and `admin-readable-command.css` were watched by `.github/workflows/deploy-site-core.yml` but not by either protected automatic merge dispatcher. A token-mediated merge may not start an ordinary `main` push workflow.
- Minimal dispatch fix source PR #6671, source SHA `77a492d5d293bcf4b90aa7b90f57aae914563c06`.
- Official EKODI Orchestrator task `orch_recovery_77a492d5d293bcf4b90aa7b90f57aae9`, recovery PR #6672 on `ai/gpt6/orch_recovery_77a492d5d293bcf4b90aa7b90f57aae9`.

## This checkpoint
This is a documentation-only first-party CI/convergence checkpoint. It changes no executable code, permissions, database, API, secrets, DNS, workflows or production settings. The approved original executable change remains an ancestor. It requests authentic GitHub checks on the official branch after bot-triggered checks were held as `action_required`.

## Evidence required before completion
1. Latest-main integration must preserve both release-dispatch classification changes and the new static regression test.
2. Exact-head authentic required CI: `test` and `EKODI AI Orchestration Gate`; application/security/unit/build checks.
3. Guarded protected merge solely through the EKODI Orchestrator with valid task/branch receipt; no direct source merge or skipped checks.
4. Existing staged Shared Site Core deployment, rollback readiness, deployed bundle fingerprint and live `/admin/ai/aiops` status; no fake production success.
5. Signed-in PC/mobile verification of 5 stage views, real status counts, safe provider actions, site detail and Chief AI command, including admin-only authorization.
6. Audit proof recorded in issue #6668. The UI source PR's merge does not by itself demonstrate live deployment.

No direct production action is authorized by this checkpoint; false-complete results must fail closed.
