# Security & Traffic Constitution
1. Edge security precedes origin; public origin and privileged infrastructure are forbidden.
2. Protected API flow is auth -> tenant -> RBAC -> rate limit -> validation -> business logic.
3. Public is cache-first; private/admin is restricted or no-cache.
4. Admin has stronger access controls; heavy work uses queues.
5. Secure Projection is the default disclosure boundary: the server sends only purpose-required fields, never browser-hidden raw fields.
6. Secrets and source/topology details are never projected to user, administrator, experience or external operational-AI surfaces; administrator diagnostics remain separately gated and auditable.
7. View, export, download, API and raw-data permissions are independent capabilities and default to least privilege.
