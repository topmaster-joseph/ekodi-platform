# EKODI Platform v3 architecture

## Scope

Version 3 is an operations MVP, not a multi-tenant business suite. Its production contract is intentionally narrow:

1. Route visitors to the six EKODI services.
2. Authenticate one platform administrator.
3. Show measured service health.
4. Maintain non-secret domain registration metadata.
5. Manage DNS only for the five explicitly allow-listed EKODI zones.
6. Record and export security-relevant operational activity.

User provisioning, content workflows, marketing recommendations, billing, and cross-service identity are out of scope until their source systems and authorization models are defined.

## Components

### Static control center

`index.html`, `styles.css`, and `script.js` form a dependency-free browser application. It stores the opaque session token in `sessionStorage`, so closing the tab removes the browser copy. A restrictive Content Security Policy disallows inline scripts.

### Authentication and operations API

`auth-worker.js` is a Cloudflare Worker using D1. It owns administrator setup, login throttling, sessions, the domain registry, audit events, and the Cloudflare API proxy. Every protected endpoint verifies the bearer session. DNS routes additionally resolve the supplied zone ID and reject zones outside the EKODI allow-list.

### Monitoring

`.github/workflows/monitor.yml` probes all six services every ten minutes. It publishes a new snapshot only when an operational state changes or the current snapshot is older than six hours. Response-time jitter therefore does not flood the `main` branch.

## Security model

- Production browser origins must be explicitly listed in `ALLOWED_ORIGINS`.
- Passwords use salted PBKDF2 hashes with versioned work factors and upgrade after a successful legacy login; session tokens are random and only their SHA-256 hashes are stored.
- Failed logins are throttled per hashed client IP, and successful logins clear the failure counter.
- D1 queries use prepared statements.
- DNS types, names, content lengths, TTL, zone IDs, and record IDs are validated server-side.
- Cloudflare tokens stay in Worker secrets and should use least-privilege zone scoping.
- Registry notes are limited to 240 characters and must never contain credentials.
- Security-sensitive mutations write an audit event.

## Data ownership

| Data | System of record | Notes |
|---|---|---|
| Service availability | GitHub Actions snapshot | Operational signal, not an SLA record |
| Admin identity and sessions | Cloudflare D1 | Single administrator in v3 |
| DNS records | Cloudflare | D1 stores audit metadata only |
| Registration dates and controls | Cloudflare D1 registry | Registrar remains authoritative |
| Audit history | Cloudflare D1 | Append-only through the API |

## Production acceptance checklist

- CI syntax checks and tests pass.
- D1 migrations apply successfully.
- Worker `/health` returns version 3.
- Production CORS allows only the deployed dashboard origins.
- `CF_API_TOKEN` can read zones and mutate DNS only for the five managed zones.
- Initial administrator setup succeeds exactly once.
- Wrong-password throttling returns HTTP 429 after eight failures in 15 minutes.
- Login, session restoration, logout, registry update, DNS create/delete, audit load, and report export work.
- Static host applies `_headers` and serves UTF-8 assets.
- GitHub Actions monitoring has `contents: write` only in the monitor workflow.

## Next architecture increments

- Replace single-admin credentials with Cloudflare Access or an OIDC identity provider.
- Move schema creation entirely to migrations after all environments are upgraded.
- Add durable alert delivery and incident acknowledgement.
- Add pagination and retention policy for audit history.
- Introduce role-based authorization only when multi-user workflows are implemented.
