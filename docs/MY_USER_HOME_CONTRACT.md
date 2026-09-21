# EKODI /my User Home Contract

## Canonical role
`https://ekodi.kr/my/` is the unified home for a signed-in person. It is not an administrator console and not merely a workspace switcher.

It organizes EKODI from the person's point of view:
- sites/spaces the person belongs to
- applications, registrations, attendance and activity history
- orders, payments, receipts, donations and benefits when a connected service supplies them
- personal documents, creations and work history
- notifications and next actions
- personal profile, linked identities and privacy settings
- EKODI User AI suggestions based on user-authorized context

## Boundary
Operational functions never belong in `/my`: user/member administration, role assignment, site configuration, publication approval, deployment, incidents, system status, or organization-wide reporting.

Those functions belong to:
- `/admin/` for platform administration
- `/{site}/admin/` for site administration

A person may be both a user and an administrator. Their personal activity remains in `/my`; operational authority remains in `/admin`.

## Site-specific user pages
`/{site}/my/` is the person's view inside one site. It may show only that site's membership, applications, participation, benefits, transactions and other user-owned records. It must not become a site-admin surface.

## Domain rule
`my.ekodi.kr` is retired permanently. Do not create redirects, canonical aliases, auth return targets, navigation links, or new dependencies that restore it. The canonical integrated user home is `https://ekodi.kr/my/`.

## UX rule
The user should not be forced to choose one workspace before seeing their personal home. `/my` first aggregates the person's relationships and activity; workspace/site selection is contextual navigation, not the identity of the page.
