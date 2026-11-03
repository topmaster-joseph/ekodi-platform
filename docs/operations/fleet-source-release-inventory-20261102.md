# EKODI fleet source / deployment inventory — 2026-11-02

Status: static registry inventory and read-only tests; not a live Cloudflare/DNS audit, deployment, or migration.

## What the four registries mean

- config/ecosystem-services.json — provider/service catalogue (37 services observed in reviewed main).
- config/site-lifecycle-registry.json — specifically declared existing workspace sites (11 in reviewed main).
- platform-boundaries.json — independent/shared release boundaries (32 in reviewed main).
- config/repository-source-of-truth.json — canonical Git source and registered satellite repositories (1 canonical and 6 satellites in reviewed main).

These counts MUST NOT be added to claim 80+ live websites. A single workspace may consume multiple services, a single service can use a shared runtime, and multiple registered surfaces may have the same intentional canonical path across different registry purposes.

## Read-only execution

Run: node scripts/audit-fleet-source-release-topology.mjs

Outputs separate service, site, release unit and source repository inventories. It reports exact path overlap and unmatched service or site IDs without asserting these are deployment failures. It checks duplicate IDs/canonical paths *within each registry*, rejects invalid first-party URL shapes, and labels all satellite migrations as unverified. Dynamic workspaces and live provider bindings are deliberately outside this static audit.

## Review work for every EKODI site

1. Match registered public path to its actual approved apex gateway route and serving Pages/Worker/API, backed by runtime evidence.
2. Verify source file ownership, repository and branch, release artifact SHA, deployment workflow, secrets scope, and source-to-production equivalence.
3. For in-repository sites, prove service-only deployment and rollback while retaining shared Worker regression checks.
4. For externally sourced or satellite-owned sites, verify contractual ownership, existing history, release proof and the exact content needed before proposing a migration. Never erase or archive the external repo as a side effect.
5. Verify PC/mobile, guest/authorized login and exact return URL, role scopes, privacy/finance/broadcast features when relevant, and rollback on the canonical production route.
6. Reconcile any changes to Constitution/Source of Truth through the C2/C3 amendment, owner gate and EKODI Orchestrator release receipt.

## Priority

- P0: all-tenant/read-only source-to-deployment inventory; no mutation to live routing.
- P1: safe low-risk independently deployed canonical-repo service as a pilot, keeping its deployment lane.
- P2: Church/Mall satellite migration design with testable source and exact SHA provenance, without moving Church authorization/data as part of source relocation.
- P3: customer/community/project satellite classification with contract/owner review.
- P4: dynamic tenant provisioning registry, live Cloudflare bindings and periodic drift checks after approved read-only connector access.

Do not mark issue #7502 complete until every relevant existing and dynamic site is reconciled, release and recovery paths are proven, and the owner/orchestrator approves the reviewed migration.
