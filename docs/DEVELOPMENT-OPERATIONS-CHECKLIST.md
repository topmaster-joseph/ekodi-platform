# EKODI Development Operations Checklist

Before promotion to production, confirm all items below.

- Development deploy workflow is green.
- Development verification workflow is green.
- Cloudflare account boundary audit is green.
- Development endpoint returns HTTP 200.
- Development workflow references only `CLOUDFLARE_DEVELOPMENT_API_TOKEN`.
- Development account ID remains `46aad4738793fbaca88574832a2ccc0f`.
- No production domain is used as a write target from the development branch.
- Production promotion is performed only by pull request to `main`.
- Production deployment credentials remain outside the development environment.

If any item fails, promotion stops until the failing boundary is repaired.
