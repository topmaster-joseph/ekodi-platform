# EKODI Mission: role-scoped public administration rollout

## Purpose

Restore activity and applicant management affordances within the published Mission site when the shared public-administration Shell or authenticated session arrives after the page script. Reuse the existing server capability contract; do not grant new roles or copy the administration UI.

## Existing service contracts

- Public entry: `/ekodimission` and its existing activity/application pages.
- Authorization endpoint: `/ekodimission/api/admin/me` with the current same-origin bearer token.
- Activity management fallback: `/ekodimission/admin/activities`.
- Shared runtime: `shell/public-surface-admin.js` (`EKODIPublicSurfaceAdmin` v2).
- No new database, route, secret, paid provider, or independent authorization logic.

## Behavior

1. Visitor with no valid token sees the ordinary service, with no privileged controls.
2. Authorized Mission activity manager sees the existing activity/applicant tools once session and shared Shell are ready, without requiring an extra refresh.
3. Repeated focus, pageshow and visibility events revalidate the server capability and do not duplicate buttons.
4. A revoked membership or logout clears attached quick-admin buttons; all mutations still require server authorization.
5. The existing administrator route stays available as a tested fallback.

## Verification

- `npm run validate:ui-surfaces` includes `test/ekodimission-inline-auth-recovery.test.mjs`.
- Assert guest → authenticated manager, repeat activation, permissions revoked, and logout.
- Confirm real production JS deployment, Mission public pages on desktop/mobile, and unauthenticated write denial before marking the release fully verified.
- An actual Google login with the owner's privileges must be recorded separately; CI simulation and anonymous smoke checks are not substitutes.

## Rollout discipline

Use the authenticated EKODI Orchestrator, protected PR review, CI, staging, guarded Operating Space deployment, actual canonical-host checks and regression tests. Keep current UI and admin fallback during rollout; do not remove routes or change local/global role scopes.

## Post-rebase CI trigger

The canonical release branch was synchronized with the protected `main` branch by EKODI's official Convergent Merge workflow. The repository-owner follow-up commit preserves the same functional scope and requests fresh protected PR checks for the synchronized revision. A successful protected merge, rollout and real-host verification are still required.
