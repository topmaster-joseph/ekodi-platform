# EKODI Shell Contract v3

EKODI uses one person identity, many workspaces, service-specific capabilities, and one shared interaction grammar. Persistent user chrome is intentionally minimal: **one common header and one common footer**.

## Identity model

Every authenticated action is interpreted as:

`Person + Space + Role + Capability`

`Space` remains a compatibility term in this browser contract. The platform constitution uses `Workspace` as the canonical operating-context term.

- **Person**: the canonical EKODI identity. A service must not create a second profile source of truth.
- **Space / Workspace**: personal, business, organization, church, community, or project context.
- **Role**: the permission held by the person inside that workspace.
- **Capability**: the service function being used.

## My EKODI responsibility

`ekodi.kr/my` is the canonical personal home and the canonical place for selecting and changing workspaces. `my.ekodi.kr` is compatibility/internal routing only.

Workspace selection, ecosystem discovery, recommendations, and service switching belong in My EKODI content. Service pages must not duplicate a global workspace directory or add persistent floating selectors.

After a user chooses a workspace, central auth/workspace handoff returns to the target service with verified context. Browser context helps navigation but never proves authorization.

## Service responsibility

A service owns its domain work. It may expose compact service-local actions in its own toolbar when they are necessary for the current task.

A service must not create persistent platform-level chrome for account identity, global workspace switching, music/audio playback, or ecosystem-wide navigation. Those concerns belong to the shared header/footer and My EKODI content model.

## Visual architecture

The shared visual architecture has three persistent responsibilities:

1. **Common header**: stable identity/service context, home behavior, language/account actions when applicable, mobile-safe fixed positioning, and accessibility behavior.
2. **Service content**: the widest practical work canvas. Task-specific controls stay local to the task and must not become global floating chrome.
3. **Common footer**: stable EKODI identity, policy/ecosystem links, language affordance where applicable, and shared closing navigation.

The canonical declarative theme source is `shell/theme.json`. `shell/shell.js` may publish theme/context APIs and events, but it must not require a visible floating selector in order to provide those APIs.

Stable work surfaces use `data-ekodi-surface="workspace"` by default. Public roots use `data-ekodi-surface="public"`. Admin, form, document, data, transition, bridge, loading, and handoff surfaces keep their declared semantics.

### Common chrome invariant

The following are forbidden as automatically injected persistent user chrome:

- `MR 재생`, background CCM/MR playback, or any equivalent global audio control.
- `공간 선택`, current-space pills, global workspace switchers, or equivalent floating workspace controls.
- A second floating EKODI global menu that duplicates the common header/footer.
- Service-local copies of the complete ecosystem service registry.

Specialized audio or workspace tools may exist only as explicit, task-local features inside a service that genuinely needs them. They must be opt-in and must not be injected by the global Shell bundle.

## Public service selector (retired)

The former shared floating public/service selector is retired. Its navigation purpose is now fulfilled by the common header/footer and My EKODI content.

The Shell may retain compatibility code or navigation APIs during migration, but no user-facing service may depend on the floating selector being rendered. Legacy selector nodes are removed by the shared runtime guard.

## Public experience rotation

Public experience rotation remains presentation-only and provider-independent.

- Time basis: `Asia/Seoul`.
- Cadence: deterministic seven-day cycle.
- Service identity, accessibility, navigation position, button geometry, content order, authentication meaning, and transaction meaning remain stable.
- Rotation may publish accent, companion, motif, rail, or CSS experience tokens, but it must not reintroduce retired floating selectors or global audio controls.
- Authenticated workspace/admin/form/document/data surfaces stay stable.

## Future-site onboarding

A new EKODI user-facing site must:

1. Register the service in `ekodi-service-manifest.js` with the required identity, workspace, capability, SSO, targetability, surface, and integration metadata.
2. Register its visual identity in `shell/theme.json` where appropriate.
3. Adopt the shared Shell or shared proxy so the common header/footer, context APIs, security rules, and shared tokens are available.
4. Call `window.EKODIShell?.setContext(...)` only for richer verified display/navigation context.
5. Declare the host surface explicitly.
6. Keep workspace selection and ecosystem discovery in My EKODI rather than adding global floating controls.
7. Never create an independent global account/profile/workspace source of truth.

## Browser context contract

Central handoff may deliver:

- `ekodi_workspace`
- `ekodi_tenant`
- `ekodi_store`

The Shell may retain a small per-service navigation context in browser storage. Private workspace data remains in the owning service/database. Server-side authorization must be re-checked for every protected action.

## Shell API

The browser API remains intentionally small:

- `EKODIShell.setContext(context)` updates display/navigation context.
- `EKODIShell.getContext()` reads current display/navigation context.
- `EKODIShell.getTheme()` returns resolved shared/service presentation tokens.
- `EKODIShell.setSurface(surface)` changes declared surface semantics and resolved tokens.
- `EKODIShell.navigate(service)` uses canonical manifest and central handoff rules.
- `EKODIShell.open()` is compatibility-only while legacy selector code is retired and must not be required by new UI.

Services consume these APIs and events rather than copying platform registries or inventing independent Shell state.

## Security boundaries

- Shell manifest/theme metadata is public-only metadata.
- The Shell never stores provider tokens, billing keys, reusable secrets, or private records.
- Workspace authorization remains server-side in the owning service or central access API.
- Browser workspace context is navigation context, never proof of authorization.
- Protected services re-check Person + Workspace + Role + Capability on the server.
- Presentation rotation never changes permissions, approvals, prices, claims, or transaction meaning.
- Shared header/footer behavior must continue to work when external AI providers are unavailable.

## UX rule

Every EKODI service should answer three questions without adding permanent floating chrome:

1. **Who am I?** Identity/account context when needed.
2. **Which workspace am I acting in?** Shown where task context requires it, not as a global switcher.
3. **What am I doing here?** Current service/capability, expressed by the service content and common header.

The common header and footer are the building frame. The work itself gets the floor space.
