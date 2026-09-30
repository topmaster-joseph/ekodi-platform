# EKODI Control Center Performance Architecture

## Goal

`admin.ekodi.kr` must stay light even as EKODI adds more services. New functions are not allowed to make the default admin entry path progressively heavier.

The operating rule is **load only what the operator is actually using**.

## Zero-waste loading rules

1. **Shell first**
   - The login and Control Center shell must render without downloading feature-specific admin modules.
   - Heavy feature code must not be added back to the initial HTML bundle.

2. **Click-to-load features**
   - Clients, Admin Accounts, Books, Affiliates and Finance load only when the operator opens that feature or enters through its deep link.
   - Background idle preloading is prohibited for heavy admin features.

3. **One response, many consumers**
   - When one API response already contains data another panel needs, the data is shared through an explicit event/state boundary instead of issuing the same request again.
   - Finance readiness is a reference implementation: the payment-key panel reuses the Finance overview response.

4. **Short in-memory freshness windows**
   - Reopening the same live panel must not immediately refetch unchanged data.
   - Explicit refresh always bypasses the freshness window.
   - Sensitive admin data is not persisted to localStorage or a service-worker cache.

5. **No standing DOM polling**
   - Long-running broad `MutationObserver` loops are prohibited.
   - A bounded observer is permitted only for a one-time bootstrap condition and must disconnect itself.
   - Feature installation should use explicit custom events.

6. **Visible-only polling**
   - Periodic refresh is permitted only while the related panel is active.
   - Hidden panels must not keep background API traffic alive.

7. **No N+1 dashboards**
   - A dashboard may not load a list and then automatically issue one request per list item solely to build summary counts.
   - Summary counts belong in the list/summary API response. Item detail is loaded only when selected.

## Performance budget

The initial Control Center path should converge toward:

- HTML + core CSS
- core Control Center JS
- compact UI JS
- central-auth handoff JS
- lightweight feature loader JS
- one session validation request
- one current-view data request when the current view actually needs data

Feature-specific CSS, JS and APIs are deferred until the operator chooses that feature.

## Language policy

A language rewrite is not a performance goal by itself.

For browser UI and Cloudflare Workers, native JavaScript remains an efficient default because it runs directly in the browser/Workers V8 runtime and avoids an additional WebAssembly bootstrap payload. TypeScript may be introduced where stronger contracts improve maintainability, but it must compile to small native JavaScript modules.

Rust/Wasm is reserved for CPU-heavy work where profiling proves a material benefit, such as large document transforms, binary processing, compression or compute-intensive parsing. It should not be introduced to solve network waterfalls, duplicate API calls or unnecessary DOM work.

## Release contract

Any performance change must pass:

`Code → syntax/test → deploy → production verification`

The CI contract must fail if heavy feature modules are eagerly injected again, idle preloading returns, or duplicate Finance readiness fetching is reintroduced.
