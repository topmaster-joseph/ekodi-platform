# EKODI Autonomous Technology Evolution

Status: active Generation 10 implementation
Effective date: 2026-09-18
Scale tier: S0

## Purpose

EKODI continuously discovers relevant technology changes, evaluates them against EKODI's current architecture and economics, and advances only evidence-supported candidates through bounded experimentation and existing governed release controls.

The operating rule is:

`Official evidence → deterministic scoring → bounded research → isolated experiment → benchmark → governed promotion → production verification → learning`

This implementation extends the existing Autonomous Discovery and Evolution Loop. It does not create a second orchestrator, a second release path, or a new provider authority.

## Source of truth

Autonomous planning must use `config/platform-source-of-truth.json`. Historical or descriptive documents may explain prior states but cannot override the current constitution, evolution model, sovereign-operations contract, orchestration policy, technology-evolution policy, service registry, or runtime routing evidence.

If current sources conflict, the system must report the state as requiring confirmation rather than guess.

## S0 economic rule

Technology adoption follows this order:

1. remove the root cause before adding infrastructure;
2. reuse an existing EKODI capability before creating a new service;
3. use deterministic/core execution when AI is unnecessary;
4. prefer free or lowest safe tiers when measured requirements are met;
5. benchmark before increasing capacity or adding a paid provider;
6. require Super Administrator authority before a new paid commitment.

Technology Radar itself uses public official release sources and existing GitHub Actions. It introduces no new paid dependency.

## Technology Radar

`ekodi-technology-radar.js` evaluates watched technologies with a fixed 100-point evidence model:

- user value: 30
- EKODI compatibility: 20
- cost efficiency: 20
- security: 15
- reversibility: 10
- operational simplicity: 5

The collector trusts official release sources only. Blogs, advertisements, community sentiment, and model self-claims may be useful research context later, but they cannot independently trigger automatic promotion.

The initial watch set covers the technologies that directly affect EKODI's current execution fabric and replaceable provider layer:

- Cloudflare Workers SDK / Wrangler
- OpenTelemetry JavaScript
- Model Context Protocol TypeScript SDK
- OpenAI Node SDK
- Anthropic TypeScript SDK
- Google Gen AI JavaScript SDK

The list is intentionally small. EKODI does not collect technologies merely because they are fashionable.

## Decision classes

- `current`: no newer official release was observed.
- `watch`: change exists but is non-material or below the bounded-assessment threshold.
- `assess`: material change deserves research, but automatic functional trial is not authorized.
- `sandbox_candidate`: high-value, free/reversible, credential-free change may advance to isolated benchmarking.
- `human_gate`: paid commitment or another sovereign decision is required.
- `evidence_unavailable`: official evidence could not be obtained; no fact is fabricated.

A radar result is not an adoption decision.

## Integration with Generation 10

Material radar findings become the existing Autonomous Discovery signal `provider_or_standard_change`. From there they use the existing research/evolution lifecycle rather than bypassing it.

Technology Radar may autonomously:

- observe official sources;
- compare a release against the governed baseline;
- score and classify a candidate;
- create research evidence;
- maintain a bounded GitHub attention record;
- recommend an isolated experiment.

It may not autonomously:

- create or rotate production secrets;
- activate billing;
- expand permissions;
- create provider lock-in;
- modify the constitution;
- mutate production directly;
- promote a platform generation.

## Evidence and observability

Every scheduled cycle produces a machine-readable JSON report and human-readable summary retained as GitHub Actions evidence for 90 days. Each entry records the baseline version, latest observed version, publication date, official evidence URL, score, materiality and decision.

Unsupported or unavailable evidence is recorded as unavailable rather than inferred.

OpenTelemetry remains a watched provider-neutral observability standard. EKODI should adopt concrete telemetry packages only after sandbox evidence shows that the added dependency improves traceability without unjustified runtime cost or coupling.

## Schedule

The default radar cadence is weekly. Technology versions change faster than EKODI should redesign itself; weekly observation reduces noise and CI consumption while still identifying material changes early. Security or provider incidents continue to use the existing health/security monitoring paths and are not delayed by this cadence.

## Completion semantics

Discovery is not implementation.
A score is not a benchmark.
A sandbox candidate is not production.
A merged change is not completion.
Deployment is not completion.

A technology change becomes learned EKODI evolution only after the existing guarded release path and production verification prove the intended improvement without unacceptable regression.
