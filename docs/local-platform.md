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
