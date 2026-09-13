# EKODI UI Surface Principles

EKODI uses one shared UI Core with explicit surfaces for the official platform, general user sites, member workspaces, tenant administration, platform administration, and service administration.

The official `ekodi.kr` platform UI may present EKODI as the primary identity. General user sites keep their service, organization, store, project, or workspace identity primary and use EKODI only as underlying infrastructure or secondary relationship context.

All surfaces share accessibility, responsive semantics, state language, and reusable UI components. Surface-specific identity and navigation do not create separate product codebases.

Desktop administrative surfaces keep primary navigation non-scrolling and use the central workspace as the page-level vertical scroll owner. Mobile may reposition the same navigation while preserving meaning and accessible targets.

The machine-readable source of truth is `config/ui-surface-policy.js`; automated checks must verify runtime surface markers and separation between platform, general-user, member, and administrative surfaces.

Canonical surface IDs: `platform-public`, `user-public`, `member-workspace`, `tenant-admin`, `platform-admin`, `service-admin`.
