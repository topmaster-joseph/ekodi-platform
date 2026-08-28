# Security & Traffic Constitution
1. Edge security precedes origin; public origin and privileged infrastructure are forbidden.
2. Protected API flow is auth -> tenant -> RBAC -> rate limit -> validation -> business logic.
3. Public is cache-first; private/admin is restricted or no-cache.
4. Admin has stronger access controls; heavy work uses queues.
