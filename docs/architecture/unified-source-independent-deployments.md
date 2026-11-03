# EKODI unified source, independent release boundaries

Status: **target architecture / migration-gated**. This document is not proof that every site has moved. Active constitutional and source-of-truth contracts prevail if any wording conflicts.

## Scope and interpretation

Applies to every EKODI-managed first-party site, organization workspace, product and future tenant surface, including Church, Mission, Mall, Books, Biz, community/merchant sites, education and civic projects. Customer-owned source repositories may remain external where the customer's ownership, security or contractual rights require it; these are governed exceptions, not a second EKODI platform core.

**One canonical source repository is the default** for EKODI-owned implementation: topmaster-joseph/ekodi-platform. Source is organized in owned directories/modules with explicit contracts. **One repository does not mean one deployment.** A release unit may be a Pages project, Worker, backend/API or shared multi-tenant service. Each release unit maintains its own deploy workflow, build output, version, verification, rollback and accountable operator. A tenant does not automatically require a dedicated Cloudflare project. Choose shared execution first unless measurable fault isolation, law, security or scale justifies a new boundary.

## Non-negotiable contracts

1. Production browser entry: https://ekodi.kr/{registered-path} through the approved apex gateway. Workspace identity is an immutable workspace_id; route paths and source folders do not grant permissions.
2. Normal changes build and deploy **only affected release units**. Shared-core changes identify all dependent units and run cross-service regressions; coordinated deployment remains explicitly guarded.
3. Immutable source SHA, build artifact identity, target environment, approval/release receipt, smoke results and rollback version are recorded for every release. Committing or deploying is not proof of production success.
4. Source secrets never ship into frontend assets. Distinct tenant financial, pastoral, membership and personal records remain scoped by authoritative server permissions, RLS, audit and data-ownership policy. Repository consolidation never merges these realms.
5. Service-level secret scopes, security headers, staging, canary/smoke verification and rollback survive any source move. Cloudflare Pages/Workers and backend/provider state are deploy targets, **not secondary Git source-of-truth repositories**.
6. CI must fail if a new release unit lacks source ownership, declared deploy lane, protected production authority or regression checks. Do not force a new per-tenant deploy lane when a registered shared service already owns the code.
7. Existing external/satellite repositories remain untouched until a reviewed cutover. Preserve history and exact-source release proof, migrate the ownership paths and workflow, verify staging/auth/PC/mobile/rollback, then switch traffic under Orchestrator authority. **After verified migration, independently backed-up history and a tested restore, obsolete GitHub source repositories are reviewed for deletion** under `SOURCE-REPO-RETIREMENT-001`, with per-repository owner authorization and independent post-deletion verification. No legacy repository or deployed resource may be deleted merely because a policy was approved.
8. Default: use the existing capability and shared runtime before registering a new service or infrastructure boundary. Exceptions require documented technical, legal or customer-ownership justification.

## Current baseline (not migration completion)

- config/repository-source-of-truth.json lists one canonical platform repository alongside active or unclassified satellite repositories, including Church and Mall.
- platform-boundaries.json declares EKODI release units with source ownership and deployWorkflow contracts; these are **not a complete list of all tenant/workspace sites**.
- Church source is still checked out from topmaster-joseph/ekodi-church by .github/workflows/deploy-ekodi-church-homepage.yml and deployed separately to Cloudflare Pages. The Church public, private and API surfaces have additional independently guarded release contracts.
- The migration/audit tool reports current registered deployment boundaries and satellite exceptions without claiming their runtime state.

## Rollout plan for all sites

A. Inventory all sites, registered workspaces, source repositories, deploy targets, service secrets, routes, data ownership, dependencies and real owner; classify current vs candidate.
B. Determine per-site *source owner* and per-release-unit deploy workflow. No assumed one-to-one mapping of site to Worker or repository.
C. Pilot one low-risk site; transfer source with verifiable history/provenance and unchanged independent release behavior; prove staging, production, rollback and tenant isolation.
D. Migrate Church and other satellites individually, preserving existing Pages projects/Workers, independent release markers and protected gates. Never move domain, provider callbacks, financial or member data as a side effect of Git migration.
E. Verify public/guest and signed-in PC/mobile surfaces, original-url login return, admin scoping, broadcast/payment operations when applicable, shared-core impact and cross-service regression.
F. Only after the audited rollout, consider a C2/C3 amendment and stronger fleet-wide enforcement. Record approved exceptions and automatically detect new unclassified repositories or undeclared release units.

## Change authority and rollback

This is a proposed *source organization target*, not permission for production topology changes. A change to canonical source-of-truth, security realm, protected constitution, Cloudflare routing, DNS or production permissions follows the existing C2/C3 proposal, owner approval, amendment/version, CI, orchestrator-issued release receipt and reversible promotion process. A failed migration keeps the original deploy lane active or restores its last verified source SHA, without changing workspace identities or deleting historical repositories.

## Final legacy repository cleanup

See `docs/operations/site-repository-consolidation-retirement-runbook.md`. Deletion is a **last step after operational cutover and independent recovery proof**. The static readiness registry records the six current satellites with `deleteRequested=false`; it does not authorize or execute any destructive GitHub action. Fully migrated and approved legacy repositories should eventually be removed rather than remaining indefinitely active. Repositories with separate customer ownership remain subject to explicit ownership/contract review.
