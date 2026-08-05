# EKODI production rollback

Use this runbook when a deployment causes a confirmed production regression. Record the affected Worker, version, start time, and operator in the incident log before changing state.

## Application or API code

1. Confirm the failure on the custom domain and the Worker preview URL.
2. In Cloudflare **Worker → Deployments**, identify the last verified version.
3. Roll back traffic to that version. A Worker version includes code, static assets, bindings, and compatibility settings, but it does not include D1 or R2 state.
4. Re-run `/health`, CORS, authentication, CMS read, and the affected user path.
5. Revert the responsible Git commit through a new pull request so GitHub returns to the same state as production. Do not force-push `main`.

Wrangler inspection commands:

```bash
pnpm exec wrangler versions list --config apps/<app>/wrangler.toml
pnpm exec wrangler deployments list --config apps/<app>/wrangler.toml
```

## D1 migration or data incident

D1 migrations are forward-only. Do not write an ad-hoc down migration against production data.

1. Stop the related write path by rolling the API back if necessary.
2. Capture the current Time Travel bookmark and the incident timestamp.
3. Confirm the desired restore point with the account owner; restore overwrites the database and cancels in-flight queries.
4. Restore `ekodi-auth` to the approved timestamp or bookmark.
5. Keep the bookmark returned by the restore so the restore itself can be undone.
6. Verify admin login, CMS pages and revisions, media metadata, registry data, and audit history.

Read-only commands:

```bash
pnpm exec wrangler d1 time-travel info ekodi-auth --config apps/operations-api/wrangler.toml
pnpm exec wrangler d1 migrations list ekodi-auth --remote --config apps/operations-api/wrangler.toml
```

The destructive `time-travel restore` command requires explicit account-owner approval.

## R2 media incident

Worker versions do not roll back R2 objects. First roll back the API to stop bad writes. Restore or remove only the exact object keys identified in the CMS audit record; never bulk-delete a prefix without a separately verified inventory and account-owner approval. D1 media metadata and R2 object state must be reconciled before reopening uploads.

## Domain cutover

Custom-domain changes are independent of Worker code. If a hostname cutover fails, detach only the affected custom domain or restore its prior DNS record after confirming the exact previous value. Domain and certificate actions require domain-owner approval.

## Completion

A rollback is complete only when production smoke checks pass, monitoring is stable, GitHub matches the deployed state, and the incident record contains the root cause and forward fix.
