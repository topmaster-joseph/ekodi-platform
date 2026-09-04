# EKODI Portable Cloud First

Effective: 2026-09-04
Constitution: v1.6.0

## Purpose
EKODI uses cloud services for speed, reliability and cost efficiency without allowing a cloud vendor to become the platform's architectural owner.

Portable Cloud First means:
- cloud is preferred when it is operationally useful;
- provider dependency is isolated behind EKODI contracts;
- canonical EKODI IDs, authorization and business logic remain provider-neutral;
- critical data keeps an export and restore path;
- one primary provider is acceptable, but an alternate target must be documented for critical capabilities;
- active-active multi-cloud is not the default because unnecessary duplication increases cost and operational complexity.

## Provider position
Google Workspace remains a collaboration provider.
Google Cloud is an optional replaceable infrastructure provider, not an extension of Workspace identity and not an EKODI source of truth.
Cloudflare remains an edge and current system-object provider, but it is governed by the same portability rules.
AWS, S3-compatible services and future providers can enter through the same contracts.

## Portable contracts
- Identity: EKODI Identity Gateway, provider identities are linked identities only.
- AI: EKODI AI Gateway, models remain replaceable compute providers.
- Database: EKODI Data Plane Adapter, PostgreSQL is preferred where a native portable database contract is needed.
- Object storage: EKODI object/file adapter, with S3-compatible semantics preferred where practical.
- Storage for human collaboration: EKODI Storage Gateway, provider object IDs remain metadata only.
- Communications: EKODI Communications Gateway.
## Google Cloud usage
Allowed optional targets are registered in `config/data-plane-contract.json`:
- `gcp-cloud-sql-postgres`: Cloud SQL for PostgreSQL behind the database adapter;
- `gcs-object`: Google Cloud Storage behind the object storage adapter.

Using either target must not change `user_id`, `workspace_id`, authorization rules or feature-level business contracts.
The Google provider can be removed by changing the provider route and migrating data through the documented exit format.

## Provider selection rule
A provider is selected in this order:
1. verified security and operational fit;
2. standards and interoperability;
3. portability and exit cost;
4. reliability and measured performance;
5. total cost, including free tiers or credits;
6. ecosystem convenience.

Free credits are a discount, not a constitution.

## Exit readiness
Every critical provider requires:
- data export format;
- alternate import target;
- rollback pointer;
- credential revocation plan;
- provider-object-ID to EKODI-ID mapping;
- cost baseline and cutover verification.

Production migration remains a separately approved guarded release. This foundation registers portable targets and enforcement only; it does not move production data by itself.
