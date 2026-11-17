# EKODI Education unified course hub — exact-head protected CI continuity

Task: `edu-unified-course-hub-20261117`  
Official orchestrator recovery task: `orch_recovery_3e063d7198b38770ccc995b63a0e7a86`  
Source proposal: #9850; authoritative official integration: #9851.

## Observed validation

- Source changes add six unique canonical course entries, three educational fields, four audience labels, learner screens and separately authorized instructor management under existing `/edu` without a new subdomain or service.
- First verified Education regression: the new `isEducationHubPath` predicate also matched reserved API URL `/teach/access`; fix applied to official source at `1a0495339f48c82af9d27fa6c5e3555cb08fc44a`.
- On that genuine source head, all required CI, Education isolated staging, orchestration, constitution, security, Cloudflare Boundary Audit, parallel guard, provider control and zero-subdomain checks completed successfully. Production was not manually triggered from the agent branch.
- After branch synchronization, official recovery HEAD advanced to `68af37bc1f0ef0d06c581c96d305d9bac39ce070` where bot-generated pull-request runs can be `action_required`. Treat that as **not passing** until authentic exact-HEAD checks run.

## User access and rollout
- Single JSON catalog is shared; course material sources are linked, not copied. Student's published class step and announcements are public, and local progress stays on-device.
- Teacher access uses EKODI central verified identity or central Control API `super_admin`, server-signed HttpOnly cookie, admin-only registered-email mutations in private existing R2 prefix. No shared instructor password is recognized by the *new* hub.
- Existing legacy Premium Studio permission mode is **not** silently changed by this release; its separate upgrade to unified email-only access must be treated as an explicit compatibility step with regressions and exact live verification. Do not confuse new hub authorization with a blanket claim for all historical tools.
- Production acceptance requires `/edu/courses/`, `/edu/fields/ai-digital/`, `/edu/audiences/foreign-workers/`, `/edu/teach/` unauthorized 401, verified teacher class stage publication, student `/edu/learn/:courseId/` display, and owner registration/revocation E2E when a live owner session is available.

This owner-authored documentation-only checkpoint asks the existing guardrails to rerun authenticated source tests at the newest official branch SHA. It changes no live credentials, route topology, or production release authority. Deployment must follow protected merge and existing Education release workflow.