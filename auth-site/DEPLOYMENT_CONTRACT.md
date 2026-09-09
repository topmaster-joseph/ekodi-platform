# EKODI Auth Deployment Contract

This boundary follows EKODI Platform Constitution v1.10.0.

- Production releases use the guarded GitHub Actions production environment.
- Production, Staging and Development use separate Google Identity clients, exact origins, session namespaces and credential profiles.
- Production human authentication is canonical at https://ekodi.kr/auth with JavaScript origin https://ekodi.kr.
- Gmail, Drive, YouTube and other capability OAuth credentials never fall back to the Google sign-in identity client.
- Cloudflare production credentials remain environment secrets and are never copied to developer nodes.
- `npm run check` and the guarded shared-site release manifest must pass before any production write.
- `npm run verify:core-production` must pass after release.
- Domain topology, source-of-truth, security-boundary, or core-provider policy changes follow the constitutional C2/C3 approval process.
