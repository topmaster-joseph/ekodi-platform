# EKODI all-site independent release impact plan — 2026-11-02

Task: `fleet-release-impact-20261102`. Status: read-only CI candidate, not a production rollout.

## Objective

Consolidating every EKODI-owned source into the canonical GitHub repository must **not** cause every site to be rebuilt and redeployed together. Each service keeps its existing guarded release/rollback unit or shared runtime when that is the current justified architecture.

Use the existing `platform-boundaries.json` (currently 32 declared units) as authoritative source ownership and deployment workflow registry. The `scripts/plan-fleet-release-impact.mjs` analyzer produces:

- **Direct release candidates**: changed source path matches owning unit's registered glob. A candidate is not authorized for deploy.
- **Downstream regression units**: transitive dependents under `sharedDependencies` where dependency exactly matches an existing registered boundary ID. These require testing; they are **not** automatically production deploy candidates.
- **Unmatched paths**: owner unknown; do not invent an all-site deploy.
- **Critical shared changes**: site-core, control-api, service-proxy, ekodi-shell or admin-auth have enlarged review scope.

Examples:

```bash
node scripts/plan-fleet-release-impact.mjs --file sites/ekodi-mall/index.html
node scripts/plan-fleet-release-impact.mjs --file ekodi-shell-worker.js
node scripts/plan-fleet-release-impact.mjs --file site-worker.js --file sites/ekodi-mall/index.html
```

All changes remain subject to Orchestrator authorization, constitutional review, staging, zero-downtime promotion and real production/signed-in regression tests. The analyzer does not inspect actual Cloudflare credentials/routes or authorize merging, deploying, deleting repositories or migrating private data.

## Actual baseline findings

- `sites/ekodi-mall/**` maps to Mall's independent Pages release candidate only.
- `ekodi-shell-worker.js` maps to the shared Shell release, with 15 dependent registered units needing cross-service regression. These dependencies are not automatic deployments.
- `site-worker.js` maps to site-core; public and private tenant routes it serves require centralized smoke/auth tests.
- Lab has an independently gated `sites/ekodi-lab` Pages source already managed within the canonical repository. Its historical `source-provenance.json` points to the imported prior Git revision; **do not rewrite history provenance to look like a live source**.
- Mall legacy GitHub repository README/package state explicitly says production deploy disabled; its source-of-truth role still says active satellite. Resolve under C2 change control when actual provider/archives are independently verified.
- Church currently reads `topmaster-joseph/ekodi-church` in its Cloudflare Pages release workflow. Importing just the front page would be an incomplete migration; preserve the full asset tree and Church source SHA release validator.

## Important limitations

An exact-match registry dependency is the only *automatic graph edge*. Descriptive sharedDependencies may describe additional dependencies and require owner review. A source glob may map multiple boundary owners; do not silently suppress any candidate. Workflow trigger path filters, dynamic tenant registrations, independent API runtimes, customer-owned repos and deployed Cloudflare versions require separate runtime evidence. There is no source deletion in this PR.

## Next migration gates (Issue #7502)

1. Verify Mall's obsolete repo history backup and restore drill; do not delete until provider bindings, legacy cron/webhooks and SOT role are reconciled.
2. Confirm Lab exact production release marker and source owner; preserve historical imported SHA.
3. Complete Church source + all assets import in a dedicated scoped PR, update protected release contract and real PC/mobile member/admin/broadcast tests.
4. Resolve association/customer repository ownership before changing source or deleting anything.
5. After each protected cutover, independently validate operational source version, access, rollback, history backup and repository-specific irreversible deletion permission.
