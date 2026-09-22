# EKODI Universal Surface System Verification Policy

Status: mandatory ecosystem-wide operational contract  
Constitution: SURFACE-SYSTEM-VERIFICATION-001  
Scope: every current and future EKODI public home, My page, operator page, workspace/service administrator page, platform Super Administrator page, and the canonical EKODI personal home at `https://ekodi.kr/my`.

## Completion rule

Normal completion is:

`implementation -> static/contract validation -> isolated synthetic E2E -> staging/candidate verification -> guarded deploy -> real canonical production canary -> SYSTEM_VERIFIED -> completion`

A commit, pull request, merge, build, deployment, HTTP 2xx, DOM-only check, or screenshot-only check is not sufficient by itself.

## Synthetic actors

The automated role matrix must exercise the actors relevant to the changed surface:

- guest
- authenticated user
- workspace member
- operator
- workspace/service administrator
- platform super administrator

It must also cover valid, expired, invalid, insufficient-authority and authorized session paths where applicable.

Synthetic identities must be purpose-built test identities or designated synthetic workspaces. They must not require production secrets to be exposed to browser code.

## Device and browser verification

For UI-affecting changes, verify at minimum:

- mobile portrait
- mobile landscape
- tablet
- desktop

An isolated browser/runtime such as Playwright/Chromium, an equivalent provider-neutral browser harness, or a stronger compatible method is required when available. Virtualization is one verification method, not the architecture; high-risk work must converge independent evidence where the execution-fabric policy requires it.

## Responsive content integrity

Every UI-affecting task must treat copy and layout as one responsive contract, not as separate cleanup work.

- Korean and other natural-language words/eojeol must not split arbitrarily in headings, body copy, labels, buttons, tabs or cards.
- Do not insert layout-only `<br>` or equivalent forced line breaks to make one viewport look correct. Copy must remain readable when the viewport changes.
- Technical identifiers such as URLs, emails, domains and code may use anywhere-breaking only through an explicit technical-text exception.
- Primary layouts must reflow automatically instead of assuming one fixed viewport. Reflow, stacking and density changes happen before readable text is reduced.
- Verify at 320, 390, 768, 1366 and 1440px widths. Horizontal page overflow, clipped primary copy, overlapping primary content, or loss of control meaning is a failed verification.
- These checks apply while writing copy, designing components and implementing CSS/JS, not only after a user reports a defect.

## Mandatory assertions

As applicable, verify:

- canonical host/path and redirect behavior
- login, logout, session expiry and invalid-session recovery
- URL/token hygiene: reusable credentials or authentication tokens must not remain exposed in the address bar after client consumption
- Person + Workspace + Role + Capability authorization
- guest-open safe public projection and protected-data separation
- operator/admin capability visibility and denial behavior
- navigation, primary actions, forms and error/recovery paths
- mobile/desktop rendering, overflow, clipping, tap/click targets and responsive transitions
- baseline keyboard/focus/label/accessibility checks
- API/data contract and tenant/workspace isolation
- secure projection: no secrets, unnecessary private fields or internal topology in client-visible output
- console/network/runtime errors that materially affect the task
- observability/health evidence
- real canonical production-host canary after guarded deployment

For changes that affect media, files, payments, messaging or other specialized capabilities, the specialized service verification policy remains additive.

## Production canary safety

Production verification uses a designated synthetic workspace, non-destructive fixture, read-only action, or reversible/idempotent write. Destructive production mutation is forbidden as a verification technique. Synthetic testing must not weaken RBAC, tenant isolation, privacy, consent, rate limits, audit, secrets handling or production safeguards.

## Evidence contract

Each run records machine-readable evidence containing:

- task ID and branch/commit
- surface and canonical URL
- synthetic actor
- device profile
- authentication state
- executed checks and outcomes
- production host
- observability result
- verification timestamp
- final state

UI-affecting changes also retain screenshots or equivalent visual evidence. Evidence must be auditable and attributable to the deployed candidate.

## States

- `SYSTEM_VERIFIED`: required automated checks and production canary passed; normal completion is allowed.
- `DEPLOYED_AWAITING_SYSTEM_VERIFICATION`: deployment exists, but completion is forbidden.
- `VERIFICATION_EXCEPTION`: a narrowly scoped unsimulatable device/OS/browser-security/provider behavior or telemetry conflict remains; not normal completion.
- `FAILED`: verification failed; repair, retest, redeploy and reverify.

Human/device testing is additive evidence. It is not the default release blocker. EKODI must not silently downgrade an automatable verification requirement into “ask the user to test it.”

## Inheritance

This policy is inherited automatically by newly added public, My, operator and administrator surfaces. A service may add stricter verification but may not weaken this baseline without a constitutional amendment.
