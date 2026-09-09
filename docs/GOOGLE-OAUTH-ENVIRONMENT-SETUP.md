# EKODI Google OAuth Environment Setup

This runbook implements EKODI Platform Constitution v1.10.0 and `config/identity-environments.json`.

## Identity clients

Create three Google OAuth 2.0 **Web application** clients. Never reuse one client across these environments.

| Client name | Authorized JavaScript origins | Purpose |
| --- | --- | --- |
| `EKODI Identity - PROD` | `https://ekodi.kr` | Production sign-in only |
| `EKODI Identity - STAGING` | `https://staging.ekodi.kr` | Staging sign-in only |
| `EKODI Identity - DEV` | `http://127.0.0.1:4173`, `http://localhost:4173` | Local development only |

Do not enter `/auth`, `/admin`, `/my` or another path in Authorized JavaScript origins. Origins are scheme + host + optional port only.

## Runtime bindings

- Production: `GOOGLE_CLIENT_ID` in the production Control API configuration.
- Staging: GitHub `staging` environment variable `GOOGLE_STAGING_CLIENT_ID`; the workflow injects it into the staging-only runtime.
- Development: `GOOGLE_DEVELOPMENT_CLIENT_ID` in local/development configuration only.

The production Google client must not contain staging, preview, workers.dev or localhost origins.

## Google service OAuth

Google sign-in identifies a person. Gmail, Drive and YouTube authorize capabilities and are operated separately.

- Gmail uses `MAIL_GOOGLE_CLIENT_ID` + `MAIL_GOOGLE_CLIENT_SECRET`.
- Drive uses `GOOGLE_DRIVE_CLIENT_ID` + `GOOGLE_DRIVE_CLIENT_SECRET`.
- YouTube publishing uses its dedicated channel client or the controlled Google OAuth broker according to the service contract.
- Service adapters must never fall back to `GOOGLE_CLIENT_ID` or a generic Google client secret.
