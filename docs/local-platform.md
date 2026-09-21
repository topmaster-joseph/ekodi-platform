# EKODI Local Platform

## Canonical model

A regional platform is owned by the region-level platform identity, not by whichever organization happens to operate it today.

- Public path: `/{region}`
- Admin path: `/{region}/admin`
- Region identity: immutable technical ID such as `local:cheonggye`
- Organization workspaces keep their own canonical paths and data ownership.

The first tenant is:

- `/cheonggye` — 청계잇다 regional platform
- `/cgma` — 청계면상인회 independent organization workspace
- `cgma.or.kr` — retained CGMA custom domain

## Governance

Regional services use delegated multi-operator governance.

Each service has:
1. one lead operator,
2. zero or more co-operators,
3. person-level roles/capabilities within each operator,
4. an auditable transfer state.

A transfer changes authority, not data ownership. Regional records remain attached to the regional platform. The system must preserve who created, reviewed, published and transferred each record or authority assignment.

Transfer sequence:

`register new operator -> overlap/co-operation -> transfer lead authority -> reduce former operator scope -> retain audit history`

Transfers may be performed per module. A whole-region transfer is not required.

## Data boundary

Regional data includes public/common regional information such as directory records, regional events, jobs, sharing, broadcasts and resident proposals.

Regional commerce programs such as **청계패스** also belong to the regional platform. The merchant association may operate merchant onboarding, campaign rules and day-to-day administration under delegated authority. Coupon/discount/point programs may be native platform capabilities, while any cash-equivalent prepaid gift-certificate or stored-value mode must keep issuer, settlement account, payment provider and regulatory responsibilities separate from the regional content/admin authority. Transferring platform operation does not automatically transfer an issuer contract or settlement account; those financial relationships require their own approved handover.

Organization-private data remains with the organization. For CGMA this includes member roster, dues, officers, association meetings and resolutions, association projects, private documents, accounting, member-only benefits and internal communications.

An organization may publish selected projections into the regional platform. A projection never changes the source-of-truth owner.

## Operating modes

- **Standalone organization**: the organization operates without any regional platform.
- **Native connected**: the organization is connected to an EKODI regional platform and receives delegated regional capabilities.
- **External connected**: the organization keeps its EKODI workspace while connecting selected public data to a non-EKODI regional platform through an adapter/API/feed.

The connected mode must not grant regional operators implicit access to private organization records.

## Cheonggye initial state

청계면상인회 is the initial delegated operator for the common Cheonggye services. This is an operating assignment only. The regional platform remains independently identifiable as `local:cheonggye`.

The legacy internal CGMA tenant alias `cheonggye` is not repurposed in this phase. This prevents authentication/member-data regressions while the public `/cheonggye` route is claimed explicitly by the regional platform.

## Regional identity and administrator access

Regional administration uses the same EKODI Google identity and a separate scoped grant. An administrator registers the Google email first; the user signs in at the canonical `https://ekodi.kr/auth/` entry with that same Google account; EKODI then resolves `Person + regional scope + role + capability` before exposing administration.

Cheonggye currently has two independent access scopes:

- `cheonggye-local` — regional governance for `/cheonggye/admin`
- `cheonggye-pass` — Cheonggye Pass operations for `/cheonggye/admin/pass`

A permission in one scope does not implicitly grant permission in another. Existing CGMA permissions under `/cgma` remain independent.

The regional governance administrator may delegate collaborators into the Cheonggye Pass child scope. External collaboration is split into two roles:

- `external_vendor` — outsourced service/vendor integration. Requires an expiry date and may inspect/test the approved integration surface, but may not manage access, member rosters, finance, secrets or production deployment.
- `external_developer` — engineering collaboration. Requires both GitHub identity and an expiry date and remains subject to the existing external-developer safe capability preset.

The user/administrator access manager is `/cheonggye/admin/access`. Platform super-administrator authority is accepted only through the existing central administrator session; a normal Google login with the same email is not silently promoted to platform authority.

