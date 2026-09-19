# EKODI Admin Workbench Contract

Status: active information architecture and interaction contract for the platform administrator surface.

## Seven navigation domains

The left Admin menu is organized by management intent rather than by repository or implementation module.

1. **핵심코어 / Core** — EKODI conversation entry, architecture, capability, AI control, identity/security, storage and execution infrastructure.
2. **공통서비스 / Shared Services** — work, communication, finance/evidence and reusable content/community/channel capabilities.
3. **전문서비스 / Professional Services** — domain-specific engines such as Marketing AI, Personal Finance, Invest, Life AI, supply network and insurance.
4. **상태서비스 / Status & Operations** — health, observability, cost, maturity, publication/maintenance and readiness.
5. **중간관리자 / Manager** — customer/workspace/organization/site-governance and administrator delegation.
6. **하위관리자 / Sub-admins** — site/store and delegated operating surfaces entered from the central Admin.
7. **기타 / Other** — provider workspaces, contracts and low-frequency platform controls that do not belong in the six primary domains.

The grouping is presentation and navigation only. It does not change role, capability, RLS, tenant isolation, approval or audit boundaries.

## First-screen interaction

The canonical `/admin/` landing surface is conversation-first:

- the canonical left Admin menu remains visible;
- the right work area contains only the EKODI conversation canvas and the **에코디와 대화하기** composer;
- no dashboard cards, duplicate history rail or quick-action clutter are shown before the first command;
- after the user sends a command, the user turn and EKODI response render above the composer in chronological order.

## Menu interaction

- Clicking a left-menu domain reveals its relevant submenu.
- Clicking a submenu opens that operating panel in the right work area.
- The bottom EKODI command composer remains available on ordinary Admin panels.
- Submitting a command from an operating panel opens the conversation in the same right work area, above the composer.
- Returning to a menu panel must not destroy the global conversation history.

## Safety

- Human approval gates remain mandatory for high-impact actions.
- Direct external/provider links keep their existing handoff policy.
- Demand-loaded panels must load before activation.
- The Admin language selector remains absent from the Admin surface.
- Production completion requires CI, guarded integration, deployment and real user-flow verification.
