# Distribution cooperative workspaces

The former `/business-coop/` preparation entry is now the cooperative operations hub. Existing browser drafts remain at `/business-coop/drafts/`. The
two new cooperatives use one Shared Site application with distinct immutable
workspace IDs, server records and tenant access grants.

| Cooperative | Public homepage | Member portal | Local administration |
| --- | --- | --- | --- |
| 희년세상협동조합 | `/jubilee/` | `/jubilee/members` | `/jubilee/admin` |
| 열린유통협동조합 | `/open/` | `/open/members` | `/open/admin` |

The Jubilee display and draft charter names are both `희년세상협동조합`, as most recently requested. Both workspaces are formation
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

The additive `0133_cooperative_distribution_workspaces.sql` and versioned `0134_cooperative_jubilee_name.sql` migrations must be
applied by the guarded Control API migration lane before Shared Site promotion.
Candidate/production canaries require `/api/public` to return `source: server`
and the exact workspace ID; static fallback does not establish readiness.

Production changes still use EKODI orchestration, protected review/merge and
guarded release. After publication, use the native Background Browser Worker
on both public roots, member portals and administrator pages in desktop/mobile
profiles. Real Google login, roster account linking and account-role operations
require separately verified production evidence.

The local operations overview `/api/cooperatives/overview` lists only workspaces with active `tenant.site.manage` grants. The explicit platform overview `/admin/workspaces/cooperatives` uses `/api/control/cooperatives/overview` and verifies a platform session. No browser draft is automatically imported or used as authorization.

## Short public locators and charter imagery

`/jubilee/` and `/open/` are public locators only. The legacy tenant keys
`jubilee-distribution` / `open-distribution`, immutable workspace UUIDs,
customer grant IDs, project snapshots, revisions, publication IDs and browser
auth storage keys are unchanged. Existing human GET/HEAD links use a same-host
308 and preserve functional queries and browser fragments; legacy APIs/assets
continue without redirecting writes. Explicit platform administration remains
under `/admin/workspaces/cooperatives/{legacy-slug}`.

Before accepting a short locator, the shared runtime checks all D1 tenant
states and publication domains, platform-reserved roots and SPACE's existing
`store_user_site_public_profile` RPC (including paused aliases). An error or
occupant blocks serving/promotion; only successful literal null means a free
SPACE alias. This is collision detection, not a new tenant or grant registry.

Both charter drafts cover agriculture/fisheries processing and distribution,
mail-order sales, joint purchasing/sales/brand, packing/delivery support,
education/information and inter-cooperative/community cooperation. Three
responsive photographic business cards illustrate those clauses alongside
the existing distinct hero photos. Captions and alt text identify all images
as AI-generated; they do not claim actual facilities, members or completed
operations. No charter provisions are amended by this visual update.
