# EKODI UI Surface Principles

EKODI uses one shared UI Core with explicit surfaces for the official platform, general user sites, member workspaces, tenant administration, platform administration, and service administration.

The official `ekodi.kr` platform UI may present EKODI as the primary identity. General user sites keep their service, organization, store, project, or workspace identity primary and use EKODI only as underlying infrastructure or secondary relationship context.

All surfaces share accessibility, responsive semantics, state language, and reusable UI components. Surface-specific identity and navigation do not create separate product codebases.

Every canonical surface also inherits the mandatory EKODI construction standard from `config/design-engine.json`: **용이성, 지역성·현장성, 가독성, 독창성, 직관성, 소통형, 맞춤형**. The implementation may prioritize these differently by surface, but none may be materially omitted. Admin personalization remains within explicit role, task and authority boundaries; public personalization remains consent-based and anonymously usable.

Desktop administrative surfaces keep primary navigation non-scrolling and use the central workspace as the page-level vertical scroll owner. Mobile may reposition the same navigation while preserving meaning and accessible targets.

The machine-readable source of truth is `config/ui-surface-policy.js`; automated checks must verify runtime surface markers and separation between platform, general-user, member, and administrative surfaces.

Canonical surface IDs: `platform-public`, `user-public`, `member-workspace`, `tenant-admin`, `platform-admin`, `service-admin`.
