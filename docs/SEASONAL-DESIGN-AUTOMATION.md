# EKODI Seasonal Design Automation

## Purpose

Seasonal and event-aware design is an operational enhancement, not a license for the AI to redesign EKODI without limits. The Chief AI may observe context, propose updates, stage reversible changes, verify them, and report results. Production autonomy is granted only for narrowly defined minor changes on explicitly approved services.

The canonical policy is `config/seasonal-design-governance.json`.

## Operating flow

```text
Calendar / ministry / campaign / organization context
                    │
                    ▼
             EKODI Chief AI
                    │
          observe + propose
                    │
                    ▼
          classify the change
          ├─ minor reversible
          └─ material brand change
                    │
                    ▼
          service-specific policy
                    │
            ┌───────┴────────┐
            ▼                ▼
       stage allowed     human gate
            │
            ▼
responsive / contrast / asset / performance / link checks
            │
            ▼
minor auto-production only when explicitly authorized
            │
            ▼
real public-host verification
            │
            ▼
administrator report + rollback reference + metric watch
```

## What the Chief AI may do automatically

The Chief AI may automatically observe dates and configured event context, compare the active surface with the service's UI DNA, prepare a proposal, and create or select minor seasonal assets. It may stage minor reversible changes when the service policy permits staging.

For services with `autoProductionMinor=true`, the AI may promote only the `minor_reversible` class after all required staging checks pass. Promotion must use the existing guarded release path and must verify the real public hostname afterward.

Examples include a hero background image, a lightweight ambient texture, a small decorative seasonal accent, seasonal microcopy, or a restrained accent adjustment that stays inside the service's existing visual family.

## What always requires an administrator decision

The following are material brand changes and remain human-gated:

- logo changes
- primary brand palette changes
- headline typography changes
- navigation or information architecture changes
- core homepage message changes
- major motion-system changes
- moving a service into a different visual family

Seasonal work must never become a back door for an unreviewed redesign.

## Service-specific behavior

### Church

Liturgical and ministry context outrank generic meteorological seasonality. Worship readability, Scripture prominence, sacred tone, and church identity are protected. Minor visual ambience may move automatically through staging and guarded promotion.

### Community and Social

Seasonal and event context can be expressive because participation and real-world gathering benefit from current visual cues. Minor reversible changes may be guarded-auto after verification.

### Marketing and Mall

Seasonal relevance is operationally useful, but urgency must not become deceptive. Minor campaign ambience may be guarded-auto; claims, pricing logic, or structural conversion changes are outside this policy.

### Biz and Business OS

Trust, executive clarity, and operational stability outrank decorative seasonality. The AI may propose and stage minor changes, but production remains administrator-approved by default.

### My EKODI

Personal ambience may change automatically, but navigation, Workspace visibility, account state, service access, and identity context must not move as part of seasonal work.

### Pay, Mail, Cloud

Seasonal design has little operational value here. Automatic staging and production are disabled. Reliability and clarity dominate.

## Provider-independent behavior

Seasonal planning must not depend on an external AI provider. `scripts/seasonal-design-advisor.mjs` provides a deterministic planning core based on the configured date, service UI DNA, and seasonal policy.

If no model or image provider is available, EKODI may reuse previously approved assets or keep the current surface. Core service must never fail because a seasonal asset cannot be generated.

Example:

```bash
npm run season:plan -- --date 2026-08-19 --service community
```

The output is a machine-readable proposal that the Chief AI or admin tooling can enrich with event context and asset generation when available.

## Required verification

Every promoted minor seasonal change must verify at least:

- desktop layout
- mobile layout
- keyboard focus
- text contrast
- text-over-image readability
- asset loading
- layout shift
- broken links
- service identity markers
- real public-host smoke test

## Administrator report

After a production change, the report must include the reason, service, season or event, change class, before/after references, staging result, production result, real-host verification result, rollback reference, metrics to watch, and any exceptions.

A report saying only “completed” is insufficient.

## Rollback

Every auto-production change must preserve a known previous version or asset reference. If public-host verification fails, layout or accessibility regresses, or an operational metric shows material harm, the release path must support rollback to the last verified state.

## Relationship to broader governance

This policy inherits the EKODI AI Mission Governance rule that the Chief AI is an orchestrator, not a sovereign authority. Seasonal design is a bounded, reversible operational delegation. High-impact changes continue to require human judgment.
