# EKODI Tenant UX Principles

Status: active UX contract for delegated administration and user-facing subsites.

## Purpose

Middle managers, local managers, store operators, pastors, organization staff and public visitors should understand the next action without knowing EKODI's internal service architecture.

## Navigation contract

- Primary navigation describes the user's work, not internal modules.
- Keep the primary level small enough to scan at a glance; place related detail functions in contextual secondary navigation.
- Selecting a primary item must lead to a real working screen or reveal its contextual choices immediately.
- High-frequency actions appear before configuration and diagnostic actions.
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

- Workspace: Home / Communication & Promotion / Operations & Finance / Site & Settings.
- Store: Home / Orders & Sales / Menu & Inventory / Customers & Reviews / Promotion & Channels / Operations & Settings.
- Church: Home / People & Care / Worship & Ministry / Records & AI / Site & Permissions.
- Trade: Home / Counterparties / Channels & Publishing / Permissions.
- EKODIMALL keeps its direct one-level operating menu.
- CMPMYI shows only frequent cross-store entry actions; detailed tools live in the selected store's own admin.

## Safety

This contract changes information architecture and presentation only. Authentication, tenant isolation, capability checks, audit requirements and production release gates remain unchanged.
