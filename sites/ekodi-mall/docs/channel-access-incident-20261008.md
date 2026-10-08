# Mall channel access incident

Observed: authenticated-looking mobile UI displays SUBJECT_FORBIDDEN. The screenshot alone does not prove API authentication.

## Diagnosis

1. Inspect marketing-growth-worker.js identityFromRequest and authSubject.
2. Verify the server receives subject_type=tenant and subject_key=ekodimall.
3. Check active tenant and enabled customer_access_grants row, or validated platform super_admin session.
4. Distinguish missing login (401), denied access (403), and service faults. Do not relax authorization.
5. Test authorized and unauthorized sessions, mobile refresh, and direct URL navigation.
6. Validate production response after deployment before declaring resolution.

## Retirement hold

Do not delete the legacy repository until functional parity, data backup, provider connection checks, production verification, and absence of legacy dependencies are demonstrated.
