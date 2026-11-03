# EKODI all-site source consolidation and legacy repository retirement

Task `site-repository-retirement-guard-20261102`. This runbook is a migration gate, not an instruction to delete a currently serving repository.

## Owner direction and operating target

- One canonical Git source for EKODI-owned implementation: `topmaster-joseph/ekodi-platform`.
- Independently guarded Pages / Workers / shared-core release units stay intact. Not every site needs its own Worker or Pages project.
- `ekodi.kr/<path>` stays canonical; immutable `workspace_id` and tenant/server permission controls remain authoritative.
- After **each legacy repository** is fully migrated and verified, plan its deletion instead of leaving obsolete live repositories indefinitely. Preserve its entire history and recoverability outside the deleted GitHub repository.
- Never delete a repository that remains a live source, whose ownership is disputed, whose contracts require retention, or whose deployed source SHA cannot be recovered.

## Migration and deletion lifecycle

| Phase | What is proven | Authority |
| --- | --- | --- |
| 0. Discover | repository/source URL, contracts, live deployment owner, secrets/workflows | read-only |
| 1. Preserve | immutable Git mirror/bundle and offsite backup hash; actual restore drill | operator review |
| 2. Import | canonical module, history provenance, duplicate-code conflict inspection | isolated task branch/PR |
| 3. Stage | service-only build, security/CI, real auth and role flows, rollback test | guarded preview |
| 4. Promote | Orchestrator release receipt and production exact SHA, PC/mobile, critical use cases | protected deployment |
| 5. Observe | old source triggers disabled, secrets revoked, live bindings reconciled; independent release works | read-only live evidence |
| 6. Delete review | all 13 preconditions of `SOURCE-REPO-RETIREMENT-001` with independently verified proof and specific owner authorization | **human and Orchestrator approval** |
| 7. Delete | execute through separately authorized GitHub deletion mechanism; never through CI, arbitrary AI task or this audit script | controlled, irreversible action |
| 8. Verify | old repo absent, production live, no old tokens/bindings, backup restorable; update canonical source registry | independent post-delete audit |

## Six existing satellites at initial review

| Legacy source | Registered classification | Review plan |
| --- | --- | --- |
| `ekodi-mall` | active-satellite; repo README describes legacy/read-only | verify no active build/cron/tokens, preserve history; then first deletion candidate |
| `ekodi-site` | unclassified; repo README claims Lab source | reconcile existing `sites/ekodi-lab` canonical Pages workflow and live release marker before treating as legacy |
| `ekodi-church` | active satellite/source | preserve Church SHA marker and worship/member/live/admin/API regression throughout import |
| `jadam-maru` | customer source | first prove customer ownership and three store boundaries before moving anything |
| `cheonggye-market` | community source | determine whether independent Pages still owns any public production route |
| `cheonggye-merchants-site` | project source | determine actual owner, deployed site and unpublished content before consolidation |

The current list is a **static registry**, not a claim to have inspected Cloudflare accounts, all GitHub secrets, customer contracts or dynamically provisioned workspaces. The readiness audit returns `retain` unless all proof exists; even then it returns **external owner review required**, never an executable delete authorization.

## Required evidence and safeguards

See `config/site-repository-retirement-readiness.json`. Every requirement has an evidence reference and independently verified actor. The most important: ownership authorization, complete history mirror/bundle outside GitHub legacy repo, hash + restore drill, exact release SHA/provenance, single live deploy owner, zero remaining legacy publishing triggers, protected CI, tenant isolation, tested rollback, revoked legacy secrets, independent release, and repo-specific owner authorization. Deletion-specific evidence must be reviewed against actual GitHub/Cloudflare and cannot be inferred from a JSON checkbox.

### Do not conflate sources and deployment targets

- A source repository is **not** an individual deployment unit.
- A service may share a runtime and still have strict release ownership; a dynamic workspace should not create a new repo.
- Git history archives are backup evidence, not an active second production source.
- Independent deployment is retained even after deleting the obsolete source repository.

## Completion claim

Project-wide completion requires all sites (including dynamic sites and customer-owned exceptions) inventoried, each intended source migrated, every affected release verified and independently roll-backable, and every obsolete GitHub repository either deleted with evidence or documented as an approved externally owned exception. A merged planning PR is not proof of retirement or operational success.
