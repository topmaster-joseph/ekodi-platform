# EKODI Shell Contract v1

EKODI sites use one person identity, many spaces, and service-specific capabilities.

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

## Future-site onboarding

A new EKODI site must do only these things to join the common My layer:

1. Add one entry to `ekodi-service-manifest.js` with `id`, `url`, `workspaceKinds`, `capabilities`, `sso`, and `targetable`.
2. Inject the shared Shell with `injectEkodiShell(response, '<service-id>')` for Worker-rendered HTML, or include:
   `<script src="https://shell.ekodi.kr/shell.js" data-ekodi-service="<service-id>"></script>`
3. When the service has richer verified context, call:
   `window.EKODIShell?.setContext({ workspaceKey, workspaceName, role, personName })`
4. Do not create an independent global account/profile/workspace source of truth.
5. If the service accepts a targeted workspace handoff, register the service in the central auth workspace target list.

## Browser context contract

The central auth handoff may deliver:

- `ekodi_workspace`
- `ekodi_tenant`
- `ekodi_store`

The Shell captures these values and retains only a small per-service navigation context in browser storage. Private workspace data remains in the owning service/database.

## Security boundaries

- The Shell manifest is public metadata only.
- The Shell never stores provider tokens, billing keys, or private records.
- Workspace authorization remains server-side in the owning service or central access API.
- The Shell's browser context is navigation context, never proof of authorization.
- Every protected service must re-check Person + Space + Role on the server.

## UX rule

Every EKODI service should answer three questions at a glance:

1. **Who am I?** Person identity, when available.
2. **Which space am I acting in?** Current Space.
3. **What am I doing here?** Current service/capability.

This keeps EKODI understandable even as the number of sites grows.
