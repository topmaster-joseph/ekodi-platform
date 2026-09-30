# EKODI Creator AI × My EKODI

## Decision

`author.ekodi.kr` remains the compatibility service hostname and deployment boundary for now. The product shown to people becomes **EKODI Creator AI**. This avoids a risky DNS/service split while the existing Author AI data, paid-AI firewall, auth handoff and deployment guardrails continue to work.

The legacy `author_*` database/table/API names remain compatibility surfaces. New product behavior is expressed through `creator_mode`, Creator Memory, and a person-scoped My EKODI portfolio contract.

## Creator modes

- `writer`: books, essays, articles and long-form writing
- `video`: video and short-form scripts/storyboards
- `podcast`: audio, interview and podcast scripts
- `lecture`: courses, lectures, seminars and workshops
- `research`: research briefs, reports, policy and expert knowledge
- `visual`: card news, infographics, visual briefs and storyboards
- `mission`: sermons, devotionals, mission and community content
- `ai`: AI-assisted workflows, experiments and digital service concepts

The first Creator AI release is text-first. For non-text media it creates production-ready briefs, scripts, prompts, outlines and review artifacts. It must not claim that video rendering, recording or image rendering happened unless a specialist media service actually performs that action.

## One person, one creative history

Creator AI uses the existing central identity contract:

`Google identity → person → personal:<person_id> workspace`

The Creator AI workspace and the My EKODI portfolio therefore share the same `workspace_key`. Multiple explicitly linked Google identities can resolve to the same person.

## My EKODI handoff

A project stays private by default.

1. The creator starts a project and chooses a `creator_mode`.
2. Creator AI stores working content in the existing private Author compatibility tables.
3. The creator moves the project to review.
4. A human must approve it (`author_approved`, shown as `CREATOR APPROVED`).
5. Only after that gate can `publish_creator_to_my_ekodi(project_id)` run.
6. The function creates or updates a private `creator_portfolio_items` record keyed to the person workspace.
7. My EKODI can read that person-scoped portfolio and later control visibility, presentation and downstream publishing.
8. Publishing to public channels remains a separate action.

This separates **creation**, **personal portfolio**, and **public distribution** instead of treating them as one irreversible publish button.

## Compatibility and future domain

Current:
- Product: EKODI Creator AI
- Compatibility service key: `author`
- Hostname: `author.ekodi.kr`
- My hub: `my.ekodi.kr`

Possible future:
- `creator.ekodi.kr` can become the canonical hostname only after staging, DNS, auth origin, CORS, worker route, admin registry and rollback paths are all validated.
- If that move is made, keep `author.ekodi.kr` as a redirect/compatibility entry for existing links.

Do not introduce a second source of truth for identity or creator ownership merely to rename the service.
