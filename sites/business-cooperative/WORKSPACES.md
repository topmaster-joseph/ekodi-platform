# Distribution cooperative workspaces

The existing generic `/business-coop` preparation tool remains available. The
two new cooperatives use one Shared Site application with distinct immutable
workspace IDs, server records and tenant access grants.

| Cooperative | Public homepage | Member portal | Local administration |
| --- | --- | --- | --- |
| 희년세상유통조합 | `/jubilee-distribution/` | `/jubilee-distribution/members` | `/jubilee-distribution/admin` |
| 열린유통협동조합 | `/open-distribution/` | `/open-distribution/members` | `/open-distribution/admin` |

The Jubilee display name remains as requested. Its formation charter uses
`희년세상유통협동조합` as a proposed legal name. Both workspaces are formation
projects, not evidence of legal incorporation, elected officers, business
registration, contribution payment or signed consent.

Business names, industries, contribution commitments and account links start
unconfirmed. Roster names never create identity or access grants. 이남현1,
이남현2 and 이남현3 have separate immutable roster IDs.

## Data and authorization

- `cooperative_projects`, `cooperative_audit`, and `cooperative_applications`
  are scoped by immutable `workspace_id` in the existing D1 binding.
- Core-owned `cooperative-core-access.js` verifies identity and reads the
  active, nonexpired grant for the exact tenant. User-editable JWT metadata and
  URL/body role claims do not grant authority.
- Member reads require a cooperative-local grant. Full administration requires
  `tenant.site.manage`; an operations-only staff grant is insufficient.
- Global authority is available only in explicit platform administration at
  `/admin/workspaces/cooperatives/{slug}` and its control API. It is not inherited
  by a member portal or local administrator page.
- Register accounts and access through existing EKODI Core user/access tools,
  then link already authorized emails to the roster. Linking does not grant roles.
- Public responses use an allowlist projection. Private account links and
  contributions are not included. Preparation data is never stored in localStorage.
- Revision checks and an atomic scoped audit prevent silent overwrites. Other
  tabs' unsaved form inputs are retained after a successful save.

## Validation and release

Run `node --test test/cooperative-workspaces.test.mjs` for SQLite and API checks.
`Cooperative Workspace Source UI` runs the EKODI Chromium source QA on desktop,
mobile and compact mobile. All browser requests are intercepted into disposable
fixtures: its receipt explicitly says `productionVerified: false`.

The additive `0133_cooperative_distribution_workspaces.sql` migration must be
applied by the guarded Control API migration lane before Shared Site promotion.
Candidate/production canaries require `/api/public` to return `source: server`
and the exact workspace ID; static fallback does not establish readiness.

Production changes still use EKODI orchestration, protected review/merge and
guarded release. After publication, use the native Background Browser Worker
on both public roots, member portals and administrator pages in desktop/mobile
profiles. Real Google login, roster account linking and account-role operations
require separately verified production evidence.
