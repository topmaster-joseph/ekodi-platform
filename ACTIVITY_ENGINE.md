# EKODI Activity Engine

A reusable workspace-owned engine for events, worship gatherings, meetings, camps, volunteering, education and other activities.

## Lifecycle
AI proposal → workspace admin review → publish → Community hub → registration → Social promotion → Connect follow-up → day-of operation → archive.

## Boundaries
- Activity records and registrations belong to the operating workspace.
- Central admin exposes health, capability status and aggregate observability only.
- New activities default to `draft` + `private` and are not public until workspace approval.
- Community is the activity hub; Social is the promotion/distribution adapter; Connect is the consent-first relationship/follow-up adapter.
- Provider-specific forms are adapters. Native registration is the canonical contract.

## Registration
Canonical fields support participant name, contact, party size, language, dietary/support notes and media consent. Capacity/waitlist automation is an application/service responsibility so concurrent registration can be handled transactionally.

## First template
`2026 에코디 한가위 열린식탁` is the first standard template, not a special-case implementation. The template uses target 25 / maximum 30 and remains private until the operating workspace approves publication.