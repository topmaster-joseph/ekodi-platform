# Development Rollback Rule

If a development deployment fails or verification detects a regression:

1. Do not promote to `main`.
2. Keep production unchanged.
3. Restore the last known-good development commit or fix forward on `development`.
4. Require a fresh successful development deploy, verification, and boundary audit.

Rollback activity must remain inside the development account. Production rollback is a separate operational action and is not triggered automatically from development.
