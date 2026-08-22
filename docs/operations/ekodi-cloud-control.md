# EKODI Cloud Control

EKODI Cloud Control is the break-glass operating layer for infrastructure changes that must not share the normal deployment credential.

## Authority model

| Level | Purpose | Default automation |
| --- | --- | --- |
| Runtime | health, read-only status, diagnostics | allowed |
| Deploy | guarded service deploy and rollback | allowed through service-specific release lanes |
| Cloud Control | infrastructure configuration mutation | deny by default; temporary scoped credential only |
| Owner | account, billing, identity ownership, root security | never delegated to routine automation |

Cloud Control must not become a second deployment lane. Service deployment remains owned by the existing service-specific GitHub Actions + Wrangler guarded release workflows.

## Cloudflare Workers Builds operation

The first Cloud Control operation is intentionally narrow: disconnect the legacy Workers Builds trigger attached to Worker `ekodi-platform`.

The operation may:

- read Worker scripts to resolve the immutable Worker tag;
- read Workers Builds triggers for `ekodi-platform`;
- delete those trigger resources;
- re-read the trigger list and require zero remaining triggers;
- write a non-secret audit record to the GitHub Actions summary and issue #406.

The operation must not:

- delete or update a Worker;
- deploy a Worker version;
- change DNS, routes, custom domains, D1, KV, R2 or secrets;
- modify another Worker;
- create a new repository connection or build trigger;
- use the normal `CLOUDFLARE_API_TOKEN` deploy credential as an elevated substitute.

## Required Cloudflare credential

Secret name: `CLOUDFLARE_BUILDS_ADMIN_TOKEN`

Store it only in the GitHub Environment `ekodi-cloud-control`.

Cloudflare permissions:

- User-scoped API token
- `Workers Builds Configuration: Edit`
- `Workers Scripts: Read`

Do not add DNS, Workers Scripts Edit, D1, R2, KV, account administration or billing permissions.

Where possible, create the token with a short TTL. Cloudflare supports token lifetime restrictions. The credential should be revoked or allowed to expire after the operation succeeds.

## Execution contract

Workflow: `.github/workflows/cloud-control-workers-builds.yml`

1. Run with `mode=plan` first.
2. Confirm the target is exactly `ekodi-platform` and review the trigger count.
3. Run with `mode=apply` only when the change is intended.
4. Enter the exact confirmation `DISCONNECT_EKODI_PLATFORM_BUILDS`.
5. The script deletes trigger resources only and verifies zero remain.
6. Review the Actions summary and issue #406 audit entry.
7. Verify a subsequent pull request no longer receives the legacy Cloudflare `ekodi-platform` build comment.
8. Expire or revoke the temporary Builds administration token.

## Future Cloud Control operations

A new infrastructure mutation must not be added by broadening this script casually. Add a new allowlisted operation with its own target constraints, tests, confirmation phrase, minimal provider permissions and post-condition. If an operation needs a wider credential than its mutation requires, redesign the operation instead of widening the permanent token.
