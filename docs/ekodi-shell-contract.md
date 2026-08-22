# EKODI Shell Contract v2

EKODI sites use one person identity, many spaces, service-specific capabilities, one shared service selector, and one stable interaction grammar.

## Identity model

Every authenticated action is interpreted as:

`Person + Space + Role + Capability`

- **Person**: the canonical EKODI identity. Do not create a second profile source of truth inside a service.
- **Space**: personal, business, organization, church, community, or project context.
- **Role**: the permission held by the person inside that space.
- **Capability**: the service function being used, such as marketing, community, work, publishing, or finance.

## My EKODI responsibility

`my.ekodi.kr` is the canonical place for selecting and changing spaces. Services do not duplicate the full workspace directory.

The Shell's `공간 전환 · My EKODI` action returns to My EKODI with `return_to=<current service URL>`. After a user chooses a space, the existing central auth/workspace handoff routes the user back to that service with a verified workspace context.

## Service responsibility

A service owns only its domain work. For example:

- Church owns worship, pastoral, group and church activity.
- Community owns groups, messages, events and community activity.
- Marketing owns brand, content, publishing and performance.

Account identity, global workspace switching, and ecosystem navigation stay in the Shell / My EKODI layer.

## Visual architecture

The Shell has four layers. They must remain separate.

1. **EKODI Core UI**: stable interaction grammar for authenticated work surfaces. The shared baseline is deep dark, high contrast, mobile-safe, keyboard-focusable, and consistent in header/navigation/card/action behavior.
2. **Service Identity**: each EKODI service has its own visual-family key, accent, companion color, and motif. Church, Community, Books, Lab, Business, Mall, Marketing and the other services must remain recognizably different rather than becoming one recolored template.
3. **Public Experience**: public service roots may use a thin, pre-approved rotating Shell treatment. It changes only the shared selector accent/glow, a narrow identity rail, and published experience tokens. It never rearranges the host site's content.
4. **Dynamic Transition Theme**: transition, bridge, loading and handoff surfaces may rotate background ambience, illustration, microcopy or restrained motion. They must not move navigation, change button geometry, alter form layout, lower contrast, change authentication meaning, or make a core service depend on an AI provider.

The canonical declarative theme source is `shell/theme.json`. `shell/shell.js` publishes the resolved tokens as CSS custom properties on `document.documentElement` and emits `ekodi:shell-theme`.

Stable work surfaces use `data-ekodi-surface="workspace"` by default. Public roots use `data-ekodi-surface="public"`. A controlled transition page may opt in with `data-ekodi-surface="transition"` or call `window.EKODIShell.setSurface('transition')`.

## Public service selector

Every active EKODI user-facing site carries the same shared Shell at the top.

On a **public** site, the compact top control shows the current service name and `EKODI 서비스 전환`. Opening it presents the active EKODI services, highlights the current service, and keeps a direct path to My EKODI.

On an **authenticated internal** surface, the same control prioritizes Person + Space + Role context. My EKODI remains the canonical full space selector. This prevents every service from inventing its own workspace directory while still allowing service-to-service movement from every site.

The selector is isolated in Shadow DOM and uses the canonical service manifest. A service must not copy the ecosystem service map into local page code.

## Public experience rotation

Public selector presentation rotates automatically under a pre-approved runtime contract:

- Time basis: `Asia/Seoul`.
- Cadence: deterministic seven-day cycle.
- Dependency: provider-independent. No AI API, remote generated asset, or scheduled production deployment is required for a new cycle.
- Service specificity: each service keeps its declared visual DNA, accent, companion color, and motif.
- Seasonal nuance: spring, summer, autumn and winter may change which pre-approved variation is selected, but service identity wins over season.
- Runtime output: selector accent/glow, a thin identity rail, and CSS experience tokens such as `--ekodi-public-accent`, `--ekodi-public-companion`, and `--ekodi-public-rail`.
- Browser event: `ekodi:public-experience` publishes the resolved service/cycle/season presentation metadata.

The automatic rotation must never change site layout, content order, navigation position, button geometry, font scale, focus treatment, contrast floor, authentication meaning, transaction meaning, or service identity. Manual administrator override always outranks automatic presentation.

Authenticated workspace/admin/form/document/data surfaces do not receive this public rotation. Their common dark work UI stays stable.

## Future-site onboarding

A new EKODI site must do only these things to join the common My layer:

1. Add one entry to `ekodi-service-manifest.js` with `id`, `url`, `workspaceKinds`, `capabilities`, `sso`, and `targetable`.
2. Add the service visual identity, accent, companion color and approved public motif to `shell/theme.json`.
3. Inject the shared Shell with `injectEkodiShell(response, '<service-id>')` for Worker-rendered HTML, or include:
   `<script src="https://shell.ekodi.kr/shell.js" data-ekodi-service="<service-id>" data-ekodi-surface="workspace"></script>`
4. When the service has richer verified context, call:
   `window.EKODIShell?.setContext({ workspaceKey, workspaceName, role, personName })`
5. Declare the host surface explicitly. Use `public` for public roots and `workspace` for normal authenticated work. Use `transition` only for approved transition surfaces.
6. Do not create an independent global account/profile/workspace source of truth.
7. If the service accepts a targeted workspace handoff, register the service in the central auth workspace target list.

## Browser context contract

The central auth handoff may deliver:

- `ekodi_workspace`
- `ekodi_tenant`
- `ekodi_store`

The Shell captures these values and retains only a small per-service navigation context in browser storage. Private workspace data remains in the owning service/database.

## Shell API

The browser API is intentionally small:

- `EKODIShell.setContext(context)` updates display/navigation context only.
- `EKODIShell.getContext()` reads the current display/navigation context.
- `EKODIShell.getTheme()` returns the resolved Core UI + service identity + optional public/transition presentation contract.
- `EKODIShell.setSurface(surface)` changes only the declared surface class and resolved visual tokens.
- `EKODIShell.navigate(service)` uses the canonical manifest and central handoff rules.

Services should consume these APIs and emitted events rather than copying service maps or inventing independent shell state.

## Security boundaries

- The Shell manifest and theme contract are public metadata only.
- The Shell never stores provider tokens, billing keys, or private records.
- Workspace authorization remains server-side in the owning service or central access API.
- The Shell's browser context is navigation context, never proof of authorization.
- Every protected service must re-check Person + Space + Role on the server.
- Public and transition design rotation is presentation only and must never change permissions, approval gates, prices, claims, transaction meaning, or authenticated workspace structure.
- A rotating public selector must continue to function even when every external AI provider is unavailable.

## UX rule

Every EKODI service should answer three questions at a glance:

1. **Who am I?** Person identity, when available.
2. **Which space am I acting in?** Current Space, on authenticated work surfaces.
3. **What am I doing here?** Current service/capability.

Public faces may differ and their shared selector may change its light through the week, but authenticated work should still feel like one EKODI building. The doors, stairs and exits stay where people expect them.
