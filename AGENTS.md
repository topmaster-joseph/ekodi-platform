# EKODI repository guidance

## Working agreement

- Preserve verified legacy content and links; do not invent organization facts.
- Keep applications independently deployable from `apps/*` and reusable code in `packages/*`.
- Use Cloudflare Workers, D1, and Workers Builds for production infrastructure.
- Never commit credentials, API tokens, passwords, payment data, or local `.dev.vars` files.
- Domain routes, OAuth installations, billing changes, and account ownership actions require the account owner.

## Required checks

- Run `pnpm install` after workspace dependency changes.
- Run `pnpm verify` before committing.
- Add or update tests for shared contracts, API behavior, and deployment metadata.
- Keep the Worker name in each `wrangler.toml` aligned with `infra/cloudflare/projects.json`.

## Code review rules

- Flag client-only authorization, unsafe HTML insertion, permissive production CORS, secrets in source, missing D1 parameter binding, or deployment paths that bypass Cloudflare.
- Flag app/domain mappings that are missing from the ecosystem catalog, CMS site list, API origin allow-list, or Cloudflare project manifest.
