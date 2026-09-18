# EKODI Constitutional Amendment — Private-by-Default Publication

- Amendment ID: `C2-PUBLICATION-2026-09-14`
- Approved by: EKODI Platform owner / Super Administrator
- Approval source: explicit owner instruction on 2026-09-14
- Change class: C2
- Effective date: 2026-09-14
- Rollback: revert this amendment and `publication-approval.v1.json`, then restore the guarded Worker/Pages release controllers to automatic post-verification promotion.

## Rule

Development, implementation, validation and deployment remain completion obligations. Publication is a separate state transition.

All newly deployed EKODI sites, services, pages, features and public-surface changes are **private by default**. Automatic release triggers may deploy a validated review artifact, but they must not replace the currently published production version. Worker releases remain as a verified `0%` candidate; Pages releases remain on an isolated preview branch. A first public Worker deployment may not bootstrap automatically.

After administrator review, an explicit manual guarded deployment (`workflow_dispatch`) is the publication approval action. Only then may the candidate be promoted to ordinary public production traffic, followed by production smoke verification. Publication is not complete until this verification passes.

Emergency immediate publication is limited to security patches, legal notices and incident recovery, requires an explicit reason, and must remain auditable.

## Exposure policy before approval

Unapproved work must not become the canonical public production version. It is excluded by default from public navigation, search indexing, recommendation and automatic external sharing. Review environments are operational surfaces, not public launch surfaces.

## Machine-readable authority

`governance/constitution/publication-approval.v1.json`
