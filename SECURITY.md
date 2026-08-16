# EKODI Security Policy

EKODI treats security as part of stewardship: protect people, tenant boundaries, credentials, service continuity, and the ability to recover without hiding incidents.

## Report a vulnerability

Do not publish secrets, access tokens, personal data, exploit payloads against production, or unresolved security details in a public issue.

Prefer GitHub private vulnerability reporting / a private Security Advisory when it is enabled for this repository. Otherwise contact the EKODI administrator through an already established private communication channel and include only the minimum information necessary to reproduce the issue safely.

## Scope priorities

Highest priority findings include:

- authentication or session bypass;
- privilege escalation or tenant-boundary bypass;
- exposed secrets or credential theft;
- remote code execution or unsafe deployment control;
- destructive production actions without the human/mission gate;
- SQL injection, stored XSS, or arbitrary script execution in administrator contexts;
- payment, insurance, finance, identity, or personal-data compromise;
- denial-of-service paths that can bypass edge controls;
- supply-chain compromise of production workflows.

## Response principles

1. Preserve evidence and avoid destructive cleanup before the impact is understood.
2. Revoke or rotate exposed credentials and sessions when compromise is plausible.
3. Contain the smallest affected boundary first.
4. Prefer reversible fixes and guarded rollback paths.
5. Verify the real production hostname after remediation.
6. Record the incident, root cause, affected scope, remediation, and prevention work.
7. Do not conceal material impact from affected people.

## Repository controls

Security-sensitive code is expected to preserve:

- Google administrator allowlisting and subject binding;
- least-privilege authorization;
- server-side mission/AI action gates;
- API rate limiting for exposed authentication and privileged mutation paths;
- restrictive browser and API security headers;
- audit evidence and session revocation;
- staging-first guarded production releases;
- tenant isolation and no cross-tenant private-data access without explicit authority;
- automated security-baseline validation in CI.

A security control must not be bypassed merely to make a release pass.
