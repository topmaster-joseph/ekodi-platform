# My EKODI Operator Hub

## Purpose

`https://ekodi.kr/my/` is the personalized operating hub for people who operate EKODI or an EKODI-powered site. It is not a required destination for ordinary members, customers, congregants, merchants, learners, or other end users.

## User experience boundary

Ordinary users stay inside the brand context they intentionally entered. A Cheonggye Merchants Association member uses the association site; a Jadam Chicken customer uses the Jadam site. Shared EKODI identity, authentication, consent, profile, notifications, billing, AI, and other common services may operate underneath without forcing a detour through My EKODI.

## Operator experience

My EKODI is a person-scoped operating cockpit. After authentication it may show only what the signed-in operator is already authorized to see:

- today's tasks and pending approvals
- important alerts and service health
- sites and services the person can administer
- direct links to the authoritative admin surface for each site
- recent operational activity and outcomes
- bounded AI recommendations and delegated-operation status

My EKODI does not become the source of truth for site settings and does not grant or elevate permissions. Administration remains in each site's authoritative admin surface.

## Navigation rule

The normal flow is:

`site user -> site-local experience`

The operator flow is:

`operator -> ekodi.kr/my/ -> authorized site/service admin surface -> operation -> summarized result back in My EKODI`

## Identity rule

EKODI Identity is platform infrastructure, not a requirement to expose the My EKODI brand. Identity and My EKODI are separate concepts:

- EKODI Identity: common person identity, authentication, authorization and shared-service binding.
- My EKODI: optional operator-facing personalized hub.

## Legacy host

`my.ekodi.kr` is compatibility-only. It must not be restored as a canonical public entry point.
