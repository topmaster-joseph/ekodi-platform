# EKODI Logical Entrypoint Standard

## Purpose
All EKODI services use `ekodi.index` as the logical name of the first user-facing entry surface. It is a role, not a physical filename and not a required public URL suffix.

## Public URL rule
- Users normally enter each service through `/`.
- `/` is mapped internally to the service's `ekodi.index` role.
- Implementations may be HTML, Worker-rendered HTML, React, PWA, server routes, or other runtimes without changing the logical entry name.

## Entry roles
- `primary`: normal production entry.
- `emergency`: independent reduced-capability entry for a critical service.
- `lastKnownGood`: most recent verified release state that can be restored safely.

## Primary vs Emergency
Primary and Emergency should preserve the same mental model: major navigation order, terminology, status semantics, and core decision flow should remain recognizable.

They must not share avoidable critical failure dependencies. Emergency should use an independent hostname/runtime where practical, minimal JavaScript, fewer integrations, read-first behavior, explicit `EMERGENCY MODE` indication, recovery/status controls, and only essential command paths.

Emergency is not a byte-for-byte clone of Primary. It is a deliberately smaller implementation of the same logical `ekodi.index` experience.

## Admin contract
The Admin `ekodi.index` is the AI Governance Cockpit. Its primary human-facing perspectives are `Overview / Decisions / Ecosystem / AI Council / System`. Existing technical consoles live below `System` rather than becoming the default landing surface.

## Deployment rule
Changes to entrypoint policy or Admin Governance UI must pass isolated staging before production promotion. Production deploys must verify the expected Governance markers after release and preserve rollback to Last Known Good.

## Source of truth
Machine-readable policy: `config/ekodi-entrypoints.json`.
