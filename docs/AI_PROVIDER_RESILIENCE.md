# EKODI AI Provider Resilience

## Principle

EKODI is **Service-first, AI-enhanced**.

An AI provider may improve a service, but no provider is allowed to become a dependency for authentication, navigation, reading, writing, saving, membership, manual administration, queues, scheduled jobs, deployment observation, backup, or recovery.

## Runtime modes

1. **Core** — provider-free essential service. This must always remain available when EKODI infrastructure itself is healthy.
2. **Free Assist** — deterministic rules, templates, existing data, search, checklists, and workflow assistance that require no paid model call.
3. **AI** — optional advanced generation, reasoning, classification, or analysis through one or more providers.

The normal degradation path is `AI -> Free Assist -> Core`. Provider errors must never reverse that dependency.

## Provider boundary

All new model calls should be placed behind `ai-resilience-runtime.js` or an equivalent server-side adapter. Provider secrets stay server-side. A provider timeout, missing credential, quota error, or outage must return a usable fallback instead of surfacing a raw provider error to the user when a fallback can satisfy the interaction.

## Release gate

Every pull request and release path is governed by `config/ai-provider-independence.json` and `scripts/validate-ai-provider-independence.mjs`.

CI explicitly runs the no-provider contract with:

```text
AI_PROVIDER=NONE
npm run test:ai-none
```

A failing no-provider survival gate blocks production promotion.

## UX rule

Do not show raw provider errors such as model names, HTTP 5xx responses, quota details, or secret/configuration problems to normal users. Use the standard degraded-service notice:

> 기본 모드로 계속 이용할 수 있습니다. AI 고급 기능은 잠시 사용할 수 없습니다.

Manual/core actions must remain available in the same screen whenever practical.

## Cost rule

Free and core workflows should prefer deterministic logic, templates, cached/static knowledge owned by EKODI, existing workspace data, and official non-AI APIs. Paid model calls are reserved for tasks where generative or reasoning value justifies the cost.

## Scope

This policy applies to every EKODI surface, including public sites, Auth, Admin, My EKODI, Marketing, Creator, Community, Work, Energy, Insurance, Publishing/Books, Business, Church, Social, and Mall, plus future EKODI services.
