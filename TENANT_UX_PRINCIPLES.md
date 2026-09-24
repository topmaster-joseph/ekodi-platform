# EKODI Tenant UX Principles

Status: active UX contract for delegated administration and user-facing subsites.

## Purpose

Middle managers, local managers, store operators, pastors, organization staff and public visitors should understand the next action without knowing EKODI's internal service architecture.

## Navigation contract

- Primary navigation describes the user's work, not internal modules.
- Keep the sidebar scannable with non-clickable task-group labels, but every visible working item must be a direct link to its destination.
- Do not require a category click followed by a second navigation click. One click from the visible manager menu must reach the requested working screen.
- High-frequency actions appear before configuration and diagnostic actions. Low-frequency controls belong under the final settings/operations group unless safety or role semantics require a dedicated entry.
- Role and capability filtering remains authoritative. UX grouping never widens data or action permissions.
- Platform administrator, delegated administrator and public user surfaces remain visually and operationally distinct.

## Role-specific administrator projections

EKODI does not give every administrator a smaller copy of the platform-super-admin menu.

- **Platform super admin** works only on the platform control surface `/admin` and owns platform-wide observability, site/brand directories, global users/admins/access, shared services/AI, deployment/incident control and global settings/audit.
- **Delegated manager / middle manager** works on the canonical admin root of the site, organization or Workspace being managed. Menus describe that operating domain, not EKODI internal architecture.
- **Local manager / lower manager / operator** sees only high-frequency tasks allowed by role and capability. Global administrator accounts, platform deployment, global security policy, cross-tenant data and platform AI policy are never projected into this menu.
- A parent manager may see child summaries and canonical handoff links only when explicitly authorized; the parent never owns an alternate child-admin route.
- The machine-readable source of truth for this projection is `config/admin-role-navigation.json` (`ADMIN-ROLE-NAV-001`).

## Readability contract

- Korean copy uses word/eojeol-safe wrapping.
- Headings have a clear visual hierarchy and balanced wrapping.
- Paragraphs and status copy use comfortable line height.
- Interactive controls maintain practical touch targets on mobile.
- Wide tables scroll horizontally instead of compressing text into unreadable columns.
- Keyboard focus remains visible.
- Public subsites keep their own brand identity while inheriting the shared readability baseline.

## Current task-oriented projections

- Workspace: group labels Home / Communication & Promotion / Operations & Finance / Site & Settings, with each permitted task shown as a direct link.
- Store: Jadam Chicken, PizzaMaru and Yogurt Purple use the same task order and direct-link menu: Store Home / Sales Management / Customers & Marketing / Store Operations / Settlement / Connections & Permissions. The working items remain Delivery Platforms, Menu & Price, Orders & Channels, Sales, Customers, Reviews, Marketing AI, Channel Automation, Inventory, Store Tasks, Cost & Settlement, Connections, User Site, Permissions & Members, and Header & Footer. Brand name, tenant data and accent identity stay separated.
- Church: Home / People & Care / Worship & Ministry / Records & AI / Site & Permissions.
- Trade: Home / Counterparties / Channels & Publishing / Permissions.
- EKODIMALL keeps its direct one-level operating menu.
- CMPMYI is the aggregate navigation hub for Jadam Chicken, PizzaMaru and Yogurt Purple. It exposes each brand's administrator working-menu links, including delivery-platform administration, while all data reads and writes remain on the selected store's own canonical admin URL and capability boundary.

## Safety

This contract changes information architecture and presentation only. Authentication, tenant isolation, capability checks, audit requirements and production release gates remain unchanged.
