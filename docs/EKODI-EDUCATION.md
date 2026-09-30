# EKODI Education

## Product boundary

EKODI Education is one specialist USER platform at `edu.ekodi.kr`.

It contains two major workflow areas:

- `/admission` — school/program discovery, official-source verification, application preparation, interview preparation and admission decisions.
- `/study` — learning, academic life, scholarship, domestic/international study and study-life preparation.

Admission and Study are not separate platforms in the current architecture. They share one deployment unit, one service identity, one Shell integration, one auth realm and a future isolated `education_*` data namespace.

## Why they stay together

Admission and Study share school/program context, education history, language qualifications, schedules, scholarship information, communications and learning goals. Splitting them before they have independent teams, customers, data models and release cycles would create duplicated infrastructure without meaningful isolation benefit.

A future split requires an explicit architecture change review and user confirmation because it changes a top-level platform boundary.

## My Journey relationship

My Journey models the person's stages; it is not the owner of Education data.

`My Journey → Admission → Study → Work / Business / Community`

Admission → Study is a same-platform transition. Study → Work or Business is a cross-platform handoff and requires explicit user choice. My Journey may suggest a transition but does not silently move private data.

## First-release data policy

The initial Education release deliberately avoids a persistent sensitive-document vault.

Allowed browser-local planning metadata:

- non-sensitive task title and due date
- official HTTPS source URL
- institution/program shortlist label
- non-sensitive study preparation note

Not stored in the browser planner:

- passport or resident-identification data
- transcript/document scans
- financial evidence
- immigration documents
- payment credentials

Any future persistent storage must use a dedicated `education_*` namespace, RLS/authorization, explicit retention rules and a separate security review.

## Official-source rule

Admissions, registration, scholarship, academic-calendar and immigration-related claims can change. High-impact facts must be linked to the current official institution or government source. AI may summarize or organize the source but must not replace it.

The product must prefer `지원 적합도` and explained missing requirements over unsupported `합격 가능성` claims.

## Human decision gates

The first release does not execute:

- application submission
- tuition/application-fee payment
- scholarship submission
- visa/immigration filing
- legally binding acceptance or contract actions

Future automation for these actions requires explicit product approval, official API/portal compatibility, user confirmation and audit logging.

## UI / Admin / Core alignment

- USER UI: Education, Admission, Study
- ADMIN UI: Education operations entry through `admin.ekodi.kr/education`
- EKODI Core: identity, auth, person-space-role authorization contracts, governance and future shared APIs
- EKODI Shell: common navigation/context surface

Education remains usable as a core planning surface even when no external AI provider is available.
