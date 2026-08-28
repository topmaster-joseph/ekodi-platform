# Development Credential Isolation

The development environment must use credentials that are independent from production.

- Development Cloudflare writes use `CLOUDFLARE_DEVELOPMENT_API_TOKEN` only.
- Production Cloudflare tokens must not be stored in the GitHub `development` environment.
- Development verification uses only public development endpoints and does not require production credentials.
- Credential values must never be committed to the repository, logs, artifacts, or documentation.
- If a development credential is exposed, rotate that credential without changing production credentials.
