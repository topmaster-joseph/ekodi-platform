# EKODI Critical Change & Recovery Policy

## Scope
This policy governs mass site deletion, bulk destructive data actions, platform-wide route/domain/authentication changes, repository deletion, and other hard-to-reverse production changes.

## Mandatory flow
1. Classify the request before execution.
2. Expand the impact graph across user routes, admin routes, APIs, authentication callbacks, data stores, shared UI, automation, external links and deployment dependencies.
3. Create a verified restore point before any production mutation.
4. Validate the candidate in an isolated branch and staging environment.
5. Require EKODI Platform Super Administrator approval for the production mutation.
6. Apply the change through the guarded release pipeline only.
7. Verify real production hosts and data integrity.
8. Keep the latest **10 verified restore points** available to the recovery UI/control plane.
9. Treat restore itself as a critical operation: create a pre-restore point first, require super-admin approval, restore, then verify production again.
10. Permanent deletion/purge is a separate approval from ordinary change approval.

## Restore point contents
A restore point should bind:
- immutable restore-point ID and timestamp
- task/actor
- source commit SHA and release reference
- D1 Time Travel bookmark or timestamp for each affected production D1 database
- long-term export reference when one exists (R2 or another approved backup boundary)
- affected service/route manifest
- verification evidence

## Retention
The control plane exposes the newest 10 verified restore points. D1 point-in-time recovery remains subject to the provider retention window; long-lived recovery points should also be exported to approved durable storage.

## Safety invariants
- A phrase such as "delete all sites" never directly authorizes unbounded production deletion.
- Critical scope may not be silently widened from the user's stated object.
- Soft-delete/disable is preferred when it satisfies the requested outcome.
- No AI worker may bypass the human gate, branch isolation, CI, staging or guarded production release.
- A restore action must preserve an undo path whenever the underlying platform supports one.
