# Cloudflare Workers Builds setup

The repository is ready for Cloudflare-native builds. Connecting GitHub and attaching `ekodi.kr` hostnames require account-owner OAuth and domain approval.

## One-time connection

For every entry in `infra/cloudflare/projects.json`:

1. Open the existing Worker in Cloudflare, or create it with the exact `worker` name.
2. In **Settings → Builds**, connect `topmaster-joseph/ekodi-platform` through the Cloudflare GitHub application.
3. Select `main` as the production branch and enable non-production branch builds.
4. Set the root directory to the repository root (`.`).
5. For site Workers, use the default build template with the entry's workspace:
   - Build: use the resolved `build` command in `infra/cloudflare/projects.json`.
   - Deploy: `pnpm exec wrangler deploy --config apps/<app>/wrangler.toml`
   - Preview: `pnpm exec wrangler versions upload --config apps/<app>/wrangler.toml`
6. For the API, use the explicit `build` value in the manifest and its Wrangler config.
7. Add the entry's watch paths so unrelated app changes do not trigger every Worker.

The Worker name must match the `name` field in its Wrangler configuration. Cloudflare should generate and retain the Builds API token; do not commit it.

## Runtime configuration

The operations API uses the existing `ekodi-auth` D1 binding. Apply migrations with:

```bash
corepack pnpm --filter @ekodi/operations-api migrate:production
```

Keep `CF_API_TOKEN` in the API Worker's encrypted secrets. Bind `ekodi-media` (and `ekodi-media-preview` for previews) as `STORAGE`; uploads are private unless an administrator explicitly marks them public. Site Workers do not need runtime secrets.

After the account owner enables R2 in the Cloudflare dashboard and accepts any displayed billing terms, create the exact buckets referenced by Wrangler:

```bash
pnpm exec wrangler r2 bucket create ekodi-media
pnpm exec wrangler r2 bucket create ekodi-media-preview
pnpm exec wrangler r2 bucket list
```

Bucket activation is the prerequisite for uploading the hardened API Worker version. Do not remove the `STORAGE` binding merely to bypass that gate.

For a brand-new D1 database, create a one-time high-entropy `SETUP_TOKEN` Worker secret before opening the platform setup form. The setup endpoint rejects initialization without the matching request header, and becomes permanently unavailable after the first administrator exists. Remove the secret after initialization:

```bash
pnpm exec wrangler secret put SETUP_TOKEN --config apps/operations-api/wrangler.toml
pnpm exec wrangler secret delete SETUP_TOKEN --config apps/operations-api/wrangler.toml
```

## Domain cutover

After ownership approval, attach each exact hostname as a Cloudflare Worker Custom Domain. Custom Domains create the DNS record and certificate, so check for conflicting CNAME records before attachment. Verify the Worker preview URL first, then attach the hostname and validate HTTPS, CMS content loading, security headers, and mobile rendering.
