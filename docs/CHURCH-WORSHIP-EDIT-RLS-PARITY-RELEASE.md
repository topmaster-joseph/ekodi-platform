# EKODI Church Sunday worship edit capability — RLS parity

## Finding verified on live database
The production `church_worship_materials` RLS policies restrict Sunday
`INSERT`, `UPDATE`, and `DELETE` to authenticated users with an
active `site_access_registry` grant: `site_key=church`, `role=tenant_admin`.
Mission Saturday management has a separate `site_key=mission` grant.
The original read-only `church-pastor-api?scope=worship-access` projection
incorrectly returned `permissions.worship=true` for a staff-only pastor
or church operator, causing the public Church "예배자료 관리" link to appear
even when the actual editor and Postgres policies would deny editing.

## Narrow corrective contract
The capability projection now follows precisely the existing authenticated,
RLS-scoped `church` tenant-admin proof. Church staff role alone does not
grant the editor, while legitimate mixed staff+tenant admins continue to pass.
No policy, role assignment, storage, finance permission, personal data,
write route or client-side bearer exposure has been changed.

## Tests and release
- `npm run validate:ui-surfaces`: denial of staff-only roles, mixed user
  tenant grant, guest denial, foreign Origin denial, and shared DB/admin parity.
- Existing user-visible Church homepage JS stays hidden-by-default.
- Official Orchestrator task `orch_recovery_ad2652f678bce51b922faac63b2d3ce0`.
- Require protected CI, normal branch protection, staging/source parity,
  production source version check, and the live read-only guest/Origin Canary.
- Actual Google operator-positive 200 and logout/role revocation remain
  independent browser proof, not inferred from this unit-test success.

The Orchestrator must synchronize this release with current protected main
and regenerate required checks rather than reusing a stale GitHub merge SHA.
