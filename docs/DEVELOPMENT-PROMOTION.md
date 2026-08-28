# EKODI Development Promotion Flow

## Boundary

- Production branch: `main`
- Development branch: `development`
- Development Cloudflare account: `46aad4738793fbaca88574832a2ccc0f`
- Development Worker: `ekodi-platform-development`
- Development endpoint: `https://ekodi-platform-development.ekodi-development.workers.dev`
- Development deployments use only the GitHub `development` environment secret `CLOUDFLARE_DEVELOPMENT_API_TOKEN`.
- Production Cloudflare credentials must never be referenced by the development deploy workflow.

## Flow

1. Changes land on `development`.
2. `Deploy EKODI Development` validates, builds, and deploys only to the development Cloudflare account.
3. `Verify EKODI Development` runs after a successful development deployment and probes only the development endpoint.
4. Production promotion happens through a reviewed pull request from `development` to `main`.
5. Production deployment remains owned by the existing `main` workflows and production credentials.

## Fail-closed rules

- Development deploy fails when the branch is not `development`.
- Development deploy fails when the account ID is not the development account.
- Development deploy fails when its dedicated API token is unavailable.
- Verification fails if its target URL does not belong to `ekodi-development.workers.dev`.
- No automatic merge or direct development-to-production deployment is permitted.
