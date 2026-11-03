# EKODI public-surface management: ecosystem-wide adoption review

Status: review / implementation specification (not a claim of platform-wide rollout)
Date: 2026-11-03
Task: `public-surface-admin-ecosystem-review-20261103`
Policy: `PUBLIC-SURFACE-ADMIN-001` in `config/ui-surface-policy.js`

## Decision

Use the public user page as the primary place for day-to-day content operations, with role-scoped controls visible only after the owning service confirms an authorized session. Reuse the current EKODI Shell `shell/public-surface-admin.js` (v2) for capability checks and quick-management entry. Extend it through **service-local adapters**, not a global write-capable CMS or a second administrator page for the same content.

**Scope:** every current or future published public user surface, independent service and sub-site. Not every registered service is currently live or offers editable content. A manifest entry is inventory, not deployment proof.

**Out of scope for basic inline editing:** identity and role grants, credentials, financial execution, pricing/settlement, payment or order capture, protected patient/member information, access-control policies, approval with legal consequences, deletion of irreversible records and autonomous external publishing. These retain protected service/admin workflows and human confirmation.

## Existing evidence from the protected main branch

- `config/ui-surface-policy.js` already declares `operationalAdministration.scope: all-current-and-future-user-independent-and-child-sites`, `defaultMode: public-surface-first`, `capabilitySource: server-authorized-role-and-membership` and progressive pilot `seonammedi`. No constitutional amendment is proposed by this review.
- `docs/ui-system-principles.md` describes PUBLIC-SURFACE-ADMIN-001 and the transition rule: prove inline user-surface management before removing redundant admin UI.
- `shell/public-surface-admin.js` implements `authorize()`, `has()`, `attach()`, safe same-origin quick-edit drawer, and fail-closed revocation cleanup; it does not grant mutations. `ekodi-shell-worker.js` serves that runtime.
- `sites/seonammedi/public/app.js` and `sites/seonammedi/public/voice-public-admin.js` use the shared runtime with service-owned admin endpoints and permissions; the voice page has a service-local inline CRUD adapter.
- `space/ekodimission.js` reuses the shared runtime for management actions. `space/ekodimission-activity-editor.js`, `mission-activity-editor-api.js` and `supabase/migrations/20261103090000_mission_activity_inline_editor.sql` add activity-copy inline editing with tenant authorization, revision checks and an audit trail. This editorial copy is *not* the source of truth for participant registration, payments or every official schedule.
- `sites/ekodi-church/church-worship-admin.js` verifies worship-specific privilege against its own backend. It is a capability-gated entry point, not ecosystem-wide inline CRUD coverage.
- Other service admin interfaces exist, including publishing and CGMA, but presence of an admin page does not establish public-page inline editing, server authorization parity, or completed migration.

## Service inventory and rollout classification

The following **37 IDs** are listed in `ekodi-service-manifest.js` on the reviewed main SHA. The phases below are a *proposed sequence of adapter audits*, not claims that listed services already have inline editing.

| Wave | Registered service IDs | Primary first-pass surface | Gate |
| --- | --- | --- | --- |
| 0 - validate existing pilots | `mission`, `church` | Activities, worship/public notices | Test authorized production edit, list/detail parity and rollback |
| 1 - editorial/public information | `marketing`, `community`, `bible`, `life`, `biz`, `journal`, `lab`, `cafe`, `edu`, `learn`, `support`, `insurance`, `live` | Titles, descriptions, schedules, locations, event/public resource copy | Service-local read/write contract and permission evidence |
| 2 - structured operational listings | `management`, `business`, `work`, `author`, `books`, `publishing`, `social`, `energy`, `mall`, `delivery`, `local-commerce`, `trade` | Public listings, non-transactional item descriptions and ordering | Distinguish published projections from canonical operational state |
| 3 - privileged, personal or not-yet-published surfaces | `my`, `space`, `messenger`, `shop`, `invest`, `money`, `pay`, `media`, `mail`, `cloud` | Only eligible public copy, where one exists | Private data and financial actions remain in service-owned protected flows |

Additional user-facing public sites not represented by those 37 service IDs must enter the same audit: `seonammedi` (working pilot), `cgma`/Cheonggye merchants, `cheonggye`, `ekodi-singles`, `mokpo-presbytery`, `pyeonggongmok`, and other customer/project paths discovered through the live route registry. Do not silently assume a route is live, a tenant is EKODI-owned, or a service is editable solely because it appears in a directory.

## Adapter contract for each owning service

An adapter is an opt-in registration, not an authorization source. The shared Shell handles display and predictable lifecycle; the owning service handles permissions, data, storage, revisions, publication and audit.

1. **Identity and scope.** Bind every editable item to immutable `workspace_id`/tenant ID, owning `serviceId`, a typed resource name and stable resource ID, and current page URL. The URL or DOM data attribute alone must never authorize a write. Public guest read remains available wherever it was already available.
2. **Capability proof.** Query a same-origin service endpoint with the current user token. Server checks active account, workspace membership and a resource-specific capability (`content.update`, `activity.update`, `notice.publish`, etc.). A platform super-admin identity does not implicitly become a tenant editor.
3. **Basic edit shape.** Inline form for low-risk, human-readable fields such as title, short summary, introductory body text, displayed date/time, venue, image caption, public link and card order when supported by the canonical source. The service defines allowlisted fields, max lengths, content sanitization, timezone and date rules. No generic freeform write to arbitrary DOM or arbitrary database fields.
4. **Canonical write.** The adapter writes to its **own existing authoritative resource endpoint**; only use a separate editorial override if explicitly modeled and clearly distinguished from booking/schedule truth. Use optimistic revision/ETag checks, validate on the server, create an auditable before/after revision and reject stale edits rather than overwriting them.
5. **Publication consistency.** Successful writes update the public list, detail view, share preview, semantic metadata and the service's own cache/SEO projection as applicable. If changes affect registration dates, inventory, recipients or notifications, leave them to the canonical workflow with human approval.
6. **Experience.** No controls or layout shift for visitors. For verified editors, a discreet Edit affordance appears near the actual content; edit, preview, save/cancel and accessible error/conflict states work on mobile and desktop. Use the existing same-origin quick-admin drawer only for more complex actions, not as a duplicate content-management implementation.
7. **Revocation and safety.** Remove controls on logout, expired token, site switch, capability revoke, stale async response and cross-account transition. Every mutation rechecks authorization server-side. Rate-limit writes, enforce same-origin/CSRF protections, preserve RLS/tenant boundaries, reject overlong payloads and malicious markup. Do not put privileged tokens in URLs, logs or public HTML.
8. **Rollback.** Preserve old secure admin route until positive real-host authenticated CRUD evidence and full parity exist. Use feature-flagged per-service rollout with an immediate disable path; keep a revision history and human-reviewed restore mechanism.

## Definition of readiness (per service, not global assertion)

- Inventory the published route(s), owning API, authoritative record, permission registry, public projections and exact UX edit targets.
- Demonstrate guest GET without edit buttons; expired/foreign/revoked user forbidden; authorized tenant user sees the correct controls; same email on different sites cannot cross-edit.
- Demonstrate on staging: create/edit, concurrent conflict, cancel, dangerous input rejection, audit history, public list/detail/share consistency and keyboard/mobile accessibility.
- Re-run adjacent registration, payment, auth, route and tenant-isolation regressions. Confirm no separate content UI is being created unnecessarily.
- Pass source, governance, security, stage, protected PR and service-isolated deploy gates. Verify **real production host** as an authenticated authorized user and a guest; record source SHA, actual endpoint HTTP evidence and rollback mechanism.
- Only then mark that service `inline_management_verified`; never mark all 37 completed from a shared library deployment.

## Implementation sequence for EKODI Orchestrator

1. Publish a read-only adoption matrix in the platform control plane (service ID, host/path, live state, owning API, content types, required permissions, adapter status, audit, last verified date). Site owners must be able to view their own status.
2. Close pilot gaps: confirm actual authorized production edits for Mission; reconcile editorial activity date against the official Saturday/event schedule or label it explicitly; verify Seonam Medi citizen-voice and section controls; verify Church worship capabilities and editorial authority scope.
3. Implement a small **adapter contract and contract test suite** under the current Shell governance, without adding generic cross-tenant write APIs or changing global permission semantics. Scope any shared-core implementation behind a separate impact review and the owner's required approval.
4. Adopt one isolated service at a time: first low-risk editorial pages, then catalog/structured listings, finally eligible protected-service public copy. Require a distinct PR/deploy and real-host proof for each owning platform.
5. Retain all service-only system/security/finance administrators; remove duplicate content-edit screens only after parity, fallback and monitoring have been proven.

## Non-goals and unresolved decision gates

- This review does not execute production mutations, create a shared database, expand any role, migrate canonical records or merge/deploy code. Those are separate governed change requests.
- A cross-platform content store, uniform write API, permission-model change or shared runtime modification requires specific shared-core impact analysis and the constitution's owner/release gates. The current recommendation intentionally avoids these.
- The real tenant permission map, actual authenticated production editing, service-specific canonical fields, and registration/payment side effects require per-service evidence before rollout.

## Suggested evidence commands

```sh
node scripts/validate-ui-surface-policy.mjs
node --test test/public-surface-admin.test.mjs test/public-surface-admin-revocation.test.mjs test/seonammedi-inline-auth-recovery.test.mjs test/ekodimission-inline-auth-recovery.test.mjs test/church-public-worship-admin-capability.test.mjs
node scripts/validate-ekodi-shell-adoption.mjs
```
