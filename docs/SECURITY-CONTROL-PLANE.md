# EKODI Security Control Plane

`security.ekodi.kr` is the internal security observability and policy control room for the EKODI ecosystem. It is not the authentication authority and it is not a public product surface.

## Responsibility split

- `auth.ekodi.kr`: identity, sign-in, session and step-up authentication.
- `security.ekodi.kr`: internal security posture, audit summaries, session/security status and policy visibility.
- EKODI Core / control API: server-side authorization and enforcement.
- `security-edge.js`: lightweight edge protections such as method blocking, size limits, rate limits and restrictive response headers.

## Lightweight architecture

The control plane must remain thin. It should display server-computed security state rather than reproduce authentication, authorization, database or AI-governance logic in the browser. No direct database credentials or provider secrets may be exposed to the UI.

The initial release is read-only. Mutation surfaces remain disabled until step-up authentication, human approval, audit evidence, rollback and tenant-boundary checks are implemented server-side.

## Failure model

The control plane is fail-closed: if identity, authorization or security dependencies cannot be verified, privileged access is denied. This must not make unrelated public EKODI services unavailable. Security-control-plane failure and public-service availability are separate failure domains.

## Access requirements

Before production activation, all of the following are required:

1. Server-side EKODI administrator identity validation integrated with the existing auth/control-plane contract.
2. Role and tenant boundary checks.
3. Restrictive CSP, `Cache-Control: no-store`, `X-Robots-Tag: noindex`, HSTS and anti-framing headers.
4. Rate limiting for privileged APIs.
5. Audit evidence for privileged reads and all future mutations.
6. Real-hostname verification on `security.ekodi.kr`.
7. Explicit review of any `workers.dev` exposure.

## Initial information architecture

The first internal dashboard may expose only aggregated, non-secret views:

- Ecosystem security posture
- Security event summary
- Admin/session health summary
- Service health and protection status
- Active security-policy version and validation status

It must never display raw credential values, unrestricted private tenant data, direct SQL access, user impersonation controls or destructive actions in the initial release.

## Risk tiers

- Low: aggregate service/security health. Authentication is still required because the domain is internal-only.
- Medium: audit and session summaries. Requires authenticated admin plus role verification.
- High: policy changes or session revocation. Requires step-up authentication, server-side policy enforcement and audit logging.
- Critical: credential rotation, tenant security override or mass revocation. Requires explicit human approval, audit logging and a reversible execution plan.

The machine-readable contract is `config/security-control-plane.json`.
