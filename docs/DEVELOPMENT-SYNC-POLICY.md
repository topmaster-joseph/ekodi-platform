# Development Baseline Synchronization Policy

`development` must periodically absorb the latest `main` baseline so development tests reflect the current production codebase.

Rules:

- Sync direction for baseline refresh: `main` -> `development`.
- Feature promotion direction: `development` -> `main` by pull request only.
- Never force-push either branch as part of synchronization.
- Preserve development-only Cloudflare workflows and credentials during baseline merges.
- After each baseline sync, require a fresh development deployment, endpoint verification, and boundary audit before any production promotion.
