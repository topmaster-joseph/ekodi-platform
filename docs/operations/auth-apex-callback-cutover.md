# EKODI Auth Callback Canonical Cutover (C3 — staged evidence)

**Canonical browser origin:** `https://ekodi.kr`. **Authentication return URL authorization:** site-specific **path prefixes**, not merely an allowed apex origin.

## Security invariants

- Browser app, targeted workspace handoff, and Supabase Access API must agree on site-specific path ownership.
- A `site=books` return may target `/books` and descendants; it must reject `/admin`, `/ekodibiz`, `/ekodichurch`, `/my` and untrusted HTTPS hosts.
- Server-origin checks do not authorize a user. Continue enforcing session, workspace access, Role/Capability, CSRF and signed handoff invariants.
- Known legacy hosts may remain in callback allowlists *only for existing sessions* while registered Google/Supabase external redirects are migrated. Do not promote them in public links.
- Do not automatically construct new `{site}.ekodi.kr` browser origins from unregistered realm IDs.

## Release evidence requirements

1. CI: `test/auth-apex-return-safety.test.mjs`, `test/church-canonical-google-auth-return.test.mjs`, `test/seonammedi-handoff-return-contract.test.mjs`, `test/seamless-sso-contract.test.mjs`, `Supabase Local CI`.
2. Stage and inspect anonymous, normal-member, workspace-admin and unrelated-site attempts. A wrong-site return must fail closed.
3. Verify `access-api` deployment to the existing production Supabase project through guarded release ownership. Before this PR, production version 18 did **not** contain the canonical path validator.
4. Confirm provider-side Google/Supabase registered redirect URLs; only then remove deprecated callback origins. Never migrate by blindly replacing allowed origins with a wildcard apex.
5. Confirm no residual Google-login loops, browser cross-realm cookie collisions, or post-login redirects to old hosts. Preserve reversible release evidence.
6. Retire old HTTP host bindings and DNS only after live callback success and complete host inventory review.

**Scope boundary:** This source patch does not mutate production Auth settings or Cloudflare DNS by itself.
