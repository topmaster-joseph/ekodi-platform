# EKODI Development Separation Status

Current design intent:

- Dedicated Cloudflare development account is active.
- Dedicated development Worker is active.
- GitHub `development` environment owns the development deployment token.
- `development` branch deploys only to the development account.
- A post-deploy development endpoint verification gate is present.
- A Cloudflare boundary audit guards against production credential leakage.
- Production promotion is review-based through `development` -> `main`.

This document is descriptive. Workflow results remain the operational source of truth.
