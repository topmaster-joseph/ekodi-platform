# EKODI Life Journey

## Decision

EKODI does not replace the existing ecosystem with one large Life application. My EKODI is the person-centered orchestration surface, while each specialist platform keeps its own deployment unit, data boundary and operational responsibility.

The Life Journey is available to every person. International students and migrants are important use cases, but nationality is not an architectural boundary.

## Journey

`Admission → Study → Career → Startup / Settlement`

This diagram is a navigation aid, not a mandatory funnel. A person may start at Career, return to Study, choose Startup without Career, or use Community without any earlier stage.

### Admission

- Product area: EKODI Education
- Route reserved: `edu.ekodi.kr/admission`
- State: planned
- Responsibility: school/program discovery, eligibility, application documents, interview and admission decision workflow

### Study

- Product area: EKODI Education
- Route reserved: `edu.ekodi.kr/study`
- State: planned
- Responsibility: learning and study-abroad preparation, academic life, mobility and scholarship support
- Admission and Study remain distinct user journeys even though they share the Education platform boundary.

### Career

- Existing product: EKODI Work
- Canonical host: `work.ekodi.kr`
- State: active
- Responsibility: talent profile, job discovery, recruiting, applications and employer workflow
- Do not create a duplicate Career database or a second recruiting platform.

### Startup

- Existing product: EKODI Business OS
- Canonical host: `business.ekodi.kr`
- Supporting ecosystem: EKODI Biz, Marketing AI, Trade and Mall
- State: active
- Responsibility: move a user who chooses entrepreneurship into existing business operations rather than reimplementing business functions in My EKODI.

### Settlement

- Existing product: EKODI Community
- Canonical host: `community.ekodi.kr`
- Supporting ecosystem: Work, Church and Energy where the user chooses them
- State: active
- Responsibility: local life, relationships, events and community connection
- Church or any specific community participation must never be a prerequisite for settlement support.

## Handoff contract

A handoff means an explicit, user-visible transition suggestion. It does not mean copying all data into the next service.

1. My EKODI may suggest a next stage when it is relevant.
2. The user chooses whether to continue.
3. Central authentication may preserve login and navigation context.
4. The destination service re-authorizes Person + Space + Role server-side.
5. Private cross-service data requires an explicit API contract, minimum necessary scope and user authorization.
6. Applications, submissions, contracts, payments and other high-impact actions keep a human confirmation gate.
7. The person may stop, reverse direction, export data or choose a different path.

## AI boundary

EKODI User AI may explain, prioritize and suggest next actions across the journey. It must not infer sensitive personal characteristics to choose a path, silently submit applications, force a career decision or create platform dependence.

Specialist AI remains bounded by the platform that owns the work. My EKODI coordinates context and choices; it is not a back door into another platform's private database.

## Implementation

Machine-readable journey contract: `my/life-journey.js`

User surface: `my.ekodi.kr/journey/`

The surface reads only central access status for active owner services. It does not directly query Work, Business or Community private tables. Admission and Study remain visibly planned until their Education implementation passes its own platform, security and production gates.
