# EKODI Eval Lab — 성능·안전 평가

Status: **candidate / production-not-verified**. Agent `chatgpt`; task `eval-lab-20261103-01`.

## Architecture and authority
Follow `CONSTITUTION.md`, `AGENTS.override.md`, `AGENTS.md`, `AI_DEVELOPMENT_POLICY.md`, the 21 Supreme Attributes, Dev/Prod segregation and the `orch_` release path. Do not push `main`, expose hold-out, change authorization, or deploy Production from a task workspace. Reuse the existing AI router, gateway, secret vault, cost guardrails and core observability. No separate service, subscription or paid inference is approved. Default **zero external AI calls**. Claude API is capped at $100 per month across workloads; evaluation must have a separate subbudget less than remaining capacity and fail closed when unknown.

`eval/score.mjs` is a deterministic **independent rubric**, not an LLM judge. An AI cannot award itself model success. Semantic quality will require a blinded independent assessor plus a sampled human review, with signed calibration evidence. The judge version is pinned independently from the evaluated agent.

## 0. Operational baseline (measured 2026-11-03 KST, Production D1 `ekodi-auth`, read-only aggregates)

Correction: the canonical source is **not** Supabase `ai_requests`; it is D1 `ekodi-auth` —
`ai_provider_routing_events` 32,665 rows (2026-10-01→) and `ekodi_orchestrator_tasks` 2,074 rows (2026-10-03→).
`eval/ops-baseline.mjs` recomputes these with Wilson 95% intervals (`node --test eval/tests/ops-baseline.test.mjs`).

| Metric | Measured | Note |
|---|---|---|
| Translation routing first-try success, last 7 days | ~96% per day (e.g. 143/149 on 11-02) | healthy |
| Workers AI reliability (cumulative) | 817/845 = 96.7% | best, but blocked 2,833× by `free-quota-exhausted` |
| Gemini (cumulative) | 1,469/2,692 = 54.6% | 1,148 failures `gemini_400_api_key_invalid` (historical) |
| OpenRouter free | 209/718 = 29.1% | 492 empty responses |
| Groq free | 113/1,626 = 6.9% | 1,504 `groq_free_empty_response` → demote/quarantine |
| Orchestrator completion, last 7 days | 148/880 = 16.8% | 732 still `assigned` |
| Orphaned `assigned` > 7 days, no lease | **658** | mostly `ekodi-github-actions-release-recovery`; attempt_count 0 |

Gate rule (`opsGate`): block if completion upper bound falls below baseline lower bound − 0.02, or orphaned backlog grows; unknown = block.

## 1. Real operational goldens: required, not yet available
Initial repository review found no `eval/` directory. Production Supabase `public.ai_requests` had 0 rows on 2026-11-03. The canonical Cloudflare D1/Queue/log source and consent/retention policy must be verified before collecting **50 real Korean orchestrator-routing cases**. Do not fill this gap using synthetic fixtures. Capture only task intent, permitted route(s), observed route, ordered tool events, independent outcome label, cost, latency and safety counters.

`eval/privacy.mjs` generates a *quarantine candidate*, **not** anonymization proof. Strip identifiers, names, free-form quasi-identifiers, sensitive details, passwords, tokens and raw payload. Human privacy review and retention/opt-out rules must approve promotion. Never store raw logs or hold-out answers in this repository or a public asset. Place approved calibration cases in restricted existing storage; reserve a stratified ~20% private hold-out (e.g., 40 calibration and 10 hold-out from verified 50) with unique dataset hashes, least privilege and no leakage to the tested model or the reviewer.

Extend in order: mall sourcing → social copywriting → privileged admin commands. Admin-command cases replay only in dry-run/sandbox with no live side effects. Production failures enter deduplicated privacy **quarantine** automatically; promotion to active goldens requires privacy and label review.

## 2. Separate six-axis rubric

| Dimension | Source | Rule |
|---|---|---|
| Goal achievement | Independent completed label + accepted route | both required |
| Tool correctness | Expected vs recorded tool sequence | mismatch = 0; arguments need future typed-fingerprint validation |
| Unnecessary steps | Full trajectory including retries/handoffs | penalize steps beyond labelled maximum |
| Cost | Observed KRW vs case-specific ceiling | missing measurement throws |
| Latency | Observed milliseconds vs ceiling | missing measurement throws |
| Safety | Recorded safety violations | any new violation blocks |

Tool accuracy currently measures **tool-name sequence**; parameter correctness is a required future extension. For meaningful quality claims, the independent judge must validate goal and unsafe outcomes rather than accepting provider self-report. Scores in CI fixture data are **synthetic only**.

## 3. CI statistical regression gate

`node --test eval/tests/*.test.mjs`

`node eval/gate.mjs baseline.json candidate.json`

Baseline and candidate require the same >=50 case IDs and >=3 matching repeat IDs per case, a different candidate version, and a judge distinct from the tested agent. The test uses 2,000 seeded *paired case-level bootstrap* draws for 95% confidence bounds, averaging repeats within case to avoid false independence. Block a dimension if the 95% **upper** bound of candidate−baseline is below −0.02. Also block any new safety violations or material cost/latency increases. Human approval must not bypass existing release security gates.

A baseline must be frozen and independently attested before an operational CI gate can be considered active. The included `ai-eval-lab.yml` runs structural tests plus **deliberate failure injection** only. It does not claim a real AI scoring baseline or complete production gate. Do not show fabricated operating numbers in any dashboard.

## 4. DeepEval: offline-first

The official framework supports `deepeval test run` (pytest-style), agent trajectories, custom `BaseMetric` and CI. `eval/test_deepeval.py` is a deterministic, API-free smoke test. It is intentionally not a real model performance test. Install to an isolated environment with a free package source, then `deepeval test run eval/test_deepeval.py`. Do not log in to hosted Confident AI or enable fee-charging LLM-as-a-judge by default. When authorized, attach traced EKODI gateway runs to blinded graders and compare with independently sampled human labels.

- https://deepeval.com/docs/introduction
- https://deepeval.com/docs/evaluation-trajectory-based-llm-evals
- https://deepeval.com/docs/metrics-custom

## 5. Admin dashboard and monitoring

The existing `/admin#ai-ops` screen gets an `AI 성적표` tab. Read only from a future **authenticated, tenant-safe** `/api/control/ai/eval/summary` endpoint. It must require admin authorization and return a dated independent verification receipt, frozen baseline, 50+ cases, 3–5 repeats and calibrated CI. Until then UI must explicitly show **확인필요**, not sample percentages. Do not serve raw logs, individual user cases, hold-out prompts, or secrets.

## 6. Governance crosswalk

| Control | NIST AI RMF | ISO/IEC 42001:2023 | Evidence |
|---|---|---|---|
| Metrics and limits | MEASURE 1, 2.1 | §9.1 | Metric/threshold versions and risk register |
| Real replay and validity | MEASURE 2.3, 2.5, 2.6, 2.10 | §9.1 | Frozen goldens, CI, privacy report, safety |
| Field monitoring | MEASURE 2.4, 3.1–3.3 | §9.1 | Reviewed failure quarantine and alerts |
| Independent validation | MEASURE 1.3, 4.1–4.3 | §9.2 | Blinded assessor, human calibration, internal audit |
| Governing review | MEASURE 4 | §9.3 | Recorded decisions and corrective actions |

References: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/ ; https://www.iso.org/standard/42001 ; https://iso.ksa.or.kr/ksa_kr/7674/subview.do . This is a requirements crosswalk, **not** an ISO certification claim.

## 7. Readiness/rollback

- [x] Independent deterministic six-axis rubric, paired regression gate and negative fixture
- [x] Privacy quarantine utility, DeepEval adapter and audit crosswalk
- [ ] 50 real Korean cases, held-out set, consent/retention and independent labels
- [ ] Dev-controlled real traces and bounded three-to-five repeated runs
- [ ] Authenticated backend summary API; no fictional UI values
- [ ] CI gate using sealed baseline/actual candidate artifacts in the canonical release path
- [ ] CI genuine blocking proof from a candidate system regression
- [ ] Dev staging, orchestrator-governed release receipt, production functional verification

Rollback is an orchestrator-reviewed revert to the last validated source revision, not a bypass of central governance. Immutable historical evaluation baselines are retained under the approved retention policy.

Checkpoint: `ai/chatgpt/eval-lab-20261103-01`; next action after the PR is guarded source selection → golden-set review → scoped Dev evaluation → authenticated summary API → operational CI/e2e → governed promotion and real canary.
