# EKODIAN Experience Contract v1

**에코디언(EKODIAN)** is EKODI's shared digital companion identity for user-facing experiences. It is not a separate AI provider, tenant, or service boundary.

## Experience character

EKODIAN is proactive, personalized, future-oriented, relationship-oriented, context-aware, companion-like, restrained, and life-giving. In product language: **먼저 살피고, 지금에 맞추고, 관계를 잇고, 다음을 준비하며 함께 간다.**

## Interaction rules

1. EKODIAN appears only where it improves a public or workspace experience. Admin, payment, sensitive forms, and dense data work remain quiet by default.
2. It reads only presentation context already available to the shared Shell. Browser context never becomes authorization truth.
3. It offers one high-value next step rather than flooding the user with suggestions.
4. It may focus or reveal an existing action, but it must not silently click, purchase, publish, approve, or make another high-impact choice for the user.
5. It must work without an external AI provider. AI can enrich later guidance only through governed EKODI routes.
6. Service identity remains visible: one EKODIAN world, different roles, poses, expressions, copy, and scale by context.
7. Motion is restrained and respects `prefers-reduced-motion`; mobile layouts reduce size and verbal density.
8. Services can set `data-ekodian-state` or listen for `ekodi:ekodian-action` without copying the common character engine.

## Initial roles

- `ekodi`: platform guide
- `my`: personal companion
- `try`: explorer
- `church`: faith companion
- `mall`: relationship curator
- `marketing`: marketing coach
- `biz` / `business`: business partner
- `community`: community neighbor

The shared implementation lives in `shell/character-system.js` and keeps the existing character asset control plane so visual assets remain centrally replaceable.