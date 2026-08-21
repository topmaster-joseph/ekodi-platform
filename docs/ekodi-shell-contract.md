# EKODI Shell Contract v2

EKODI sites use one person identity, many spaces, service-specific capabilities, and one stable interaction grammar.

## Identity model

Every authenticated action is interpreted as:

`Person + Space + Role + Capability`

- **Person**: the canonical EKODI identity. Do not create a second profile source of truth inside a service.
- **Space**: personal, business, organization, church, community, or project context.
- **Role**: the permission held by the person inside that space.
- **Capability**: the service function being used, such as marketing, community, work, publishing, or finance.

## My EKODI responsibility

`my.ekodi.kr` is the canonical place for selecting and changing spaces. Services do not duplicate the full workspace directory.

The Shell's `공간 전환` action returns to My EKODI with `return_to=<current service URL>`. After a user chooses a space, the existing central auth/workspace handoff routes the user back to that service with a verified workspace context.

## Service responsibility

A service owns only its domain work. For example:

- Church owns worship, pastoral, group and church activity.
- Community owns groups, messages, events and community activity.
- Marketing owns brand, content, publishing and performance.

Account identity, global workspace switching, and ecosystem navigation stay in the Shell / My EKODI layer.

## Visual architecture

The Shell has three layers. They must remain separate.

1. **EKODI Core UI**: stable interaction grammar for authenticated work surfaces. The shared baseline is deep dark, high contrast, mobile-safe, keyboard-focusable, and consistent in header/navigation/card/action behavior.
2. **Service Identity**: a small identity layer such as accent color and visual-family key. It may distinguish Social, Church, Biz, Books, Trade and other services without changing the interaction grammar.
3. **Dynamic Theme**: a thin, reversible ambience layer reserved for transition, bridge, loading and handoff surfaces. It may rotate background ambience, illustration, microcopy or restrained motion, but it must not move navigation, change button geometry, alter form layout, lower contrast, change authentication meaning or make a core service depend on an AI provider.

The canonical declarative theme source is `shell/theme.json`. `shell/shell.js` publishes the resolved tokens as CSS custom properties on `document.documentElement` and emits `ekodi:shell-theme` so a service can consume the same contract without copying shell CSS.

Stable work surfaces use `data-ekodi-surface="workspace"` by default. A controlled transition page may opt in with `data-ekodi-surface="transition"` or call `window.EKODIShell.setSurface('transition')`. Dynamic ambience is deterministic for the day and service, not random per render, so a page does not visually jump during normal use.

## Future-site onboarding

A new EKODI site must do only these things to join the common My layer:

1. Add one entry to `ekodi-service-manifest.js` with `id`, `url`, `workspaceKinds`, `capabilities`, `sso`, and `targetable`.
2. Inject the shared Shell with `injectEkodiShell(response, '<service-id>')` for Worker-rendered HTML, or include:
   `<script src="https://shell.ekodi.kr/shell.js" data-ekodi-service="<service-id>" data-ekodi-surface="workspace"></script>`
3. When the service has richer verified context, call:
   `window.EKODIShell?.setContext({ workspaceKey, workspaceName, role, personName })`
4. For a non-work surface, declare it explicitly with `window.EKODIShell?.setSurface('transition')` or an equivalent approved surface name. Never infer a dynamic transition theme for normal work pages.
5. Do not create an independent global account/profile/workspace source of truth.
6. If the service accepts a targeted workspace handoff, register the service in the central auth workspace target list.

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
- `EKODIShell.getTheme()` returns the resolved Core UI + service identity + optional dynamic ambience contract.
- `EKODIShell.setSurface(surface)` changes only the declared surface class and resolved visual tokens.
- `EKODIShell.navigate(service)` uses the canonical manifest and central handoff rules.

Services should consume these APIs rather than copying service maps or inventing independent shell state.

## Security boundaries

- The Shell manifest and theme contract are public metadata only.
- The Shell never stores provider tokens, billing keys, or private records.
- Workspace authorization remains server-side in the owning service or central access API.
- The Shell's browser context is navigation context, never proof of authorization.
- Every protected service must re-check Person + Space + Role on the server.
- Dynamic themes are presentation only and must never change permissions, approval gates, prices, claims, or transaction meaning.

## UX rule

Every EKODI service should answer three questions at a glance:

1. **Who am I?** Person identity, when available.
2. **Which space am I acting in?** Current Space.
3. **What am I doing here?** Current service/capability.

The visual rule is equally simple: public faces may differ, but authenticated work should feel like one EKODI building. Transition surfaces may change their light; the doors, stairs and exits stay where people expect them.
