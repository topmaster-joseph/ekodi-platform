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
- Store: group labels Home / Orders & Sales / Menu & Inventory / Customers & Reviews / Promotion & Channels / Operations & Settings, with each permitted task shown as a direct link.
- Church: Home / People & Care / Worship & Ministry / Records & AI / Site & Permissions.
- Trade: Home / Counterparties / Channels & Publishing / Permissions.
- EKODIMALL keeps its direct one-level operating menu.
- CMPMYI shows only frequent cross-store entry actions; detailed tools live in the selected store's own admin.

## Safety

This contract changes information architecture and presentation only. Authentication, tenant isolation, capability checks, audit requirements and production release gates remain unchanged.
