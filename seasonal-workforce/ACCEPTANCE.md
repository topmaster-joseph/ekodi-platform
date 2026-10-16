# Seasonal workforce portal: implementation acceptance contract

## Current state
This PR contains public demonstration pages and a **non-applied**, deny-by-default SQL design. It is not a production portal and is not a worker recruitment/placement system.

## Required production work
1. Register `/ekodibiz/seasonal-workers/` in the existing canonical route registry without introducing a second auth callback or redirecting to My EKODI.
2. Confirm legal operator and the municipal tenant authority. A private software vendor must not conduct recruitment, selection, placement, visa decisions or collect placement fees.
3. Reconcile tenant identity with the existing EKODI authentication model. Implement server-enforced RBAC (municipal operator, farm applicant, document reviewer, platform security administrator); never trust client-supplied tenant IDs.
4. Implement authenticated POST/GET/PATCH for farm demand submissions with CSRF/origin checks, strict input validation, rate limits, and audit events. Applicant may view own submissions; municipality may review only within assigned tenant.
5. Add MOU document metadata, versioning, access controls and audit events. Store private documents in protected storage, never public assets.
6. Add statistics from authorized records only; mask small groups and avoid publishing personal data.
7. Define consent/notice, legal basis, data minimization, retention and deletion with the actual operator before activating personal data flows.
8. Run database migration only after security review and add tested RLS policies based on the actual membership table.
9. Run existing required CI, security and constitutional checks; stage via the official orchestrator; test PC/mobile with EKODI Chromium for anonymous, farm and municipal operator accounts, including denied cross-tenant requests and login return URL.
10. Protect merge, deploy and rollback; collect real HTTP, browser and DB evidence before declaring success.

## Explicit non-goals
- No automatic government allocation, immigration or visa issuance.
- No unauthorized cross-border personal-data sharing.
- No live application submission on the demonstration survey.
- No synthetic operational statistics represented as real.

## Manual test matrix
| Case | Expected |
| --- | --- |
| Public homepage desktop/mobile | Responsive, readable, no personal data |
| Survey demo | Calculates person-months; does not transmit/store |
| Invalid survey | Browser validation blocks invalid input |
| Anonymous private API | 401 |
| Farm A reads Farm B record | 403 or non-disclosure 404 |
| Tenant A admin reads tenant B | 403 or non-disclosure 404 |
| Non-admin approves | 403 |
| Approved admin review | Audit event + tenant-scoped status update |
| Login from nested path | Return to original nested path, no My EKODI redirect |
| Rollback drill | Previous working revision restored |

This contract is a specification, not a claim that the tests have run.
