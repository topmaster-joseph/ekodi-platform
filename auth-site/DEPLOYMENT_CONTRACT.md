# EKODI Auth Deployment Contract

This boundary follows EKODI Platform Constitution v1.0.0.

- Production releases use the guarded GitHub Actions production environment.
- Cloudflare production credentials remain environment secrets and are never copied to developer nodes.
- `npm run check` and the guarded shared-site release manifest must pass before any production write.
- `npm run verify:core-production` must pass after release.
- Domain topology, source-of-truth, security-boundary, or core-provider policy changes follow the constitutional C2/C3 approval process.
