# Claude Code Instructions for EKODI

Claude Code must follow `CONSTITUTION.md`, `AGENTS.md`, and `AI_DEVELOPMENT_POLICY.md`.

For every coding task, Claude must:

- work from a unique `task_id`;
- use a task-specific branch, preferably `ai/claude/<task-id>`;
- use an independent Git worktree or equivalent isolated sandbox when concurrent work exists;
- never share a mutable working directory with another AI or developer task;
- never directly push, force-push, or commit to `main` or a production branch;
- never directly deploy production from its task workspace;
- run the applicable repository validation and tests;
- deliver changes through a pull request to the central validation/review/merge pipeline;
- keep production credentials out of the task workspace;
- report the branch, commit SHA, validation result, and unresolved risks.

## Release provenance: do not merge your own PR

A task branch (`ai/claude/<task-id>`) carries the work, but it cannot carry a
release. Pushing `main` runs the release-grade orchestration gate, which
resolves the merged PR's head ref and requires an orchestrator-issued branch
of the form `ai/<agent>/orch_<task-id>` with a matching release receipt from
the canonical orchestrator. A task branch has neither, so the gate refuses it.

The consequence is not a failed check but an undeployed platform: the code
reaches `main` while every deployment lane that observes those paths fails at
the gate. Control API, Shared Site Core, Business OS and the Cloudflare
boundary audit all behave this way.

Therefore, after CI passes on a task-branch PR, Claude does not merge it.
EKODI's release provenance recovery opens an `ai/<agent>/orch_recovery_<sha>`
pull request carrying the same change; that orchestrator-issued PR is the one
that gets merged, and its push to `main` is what deploys. Merging the task
branch first consumes the content and leaves the recovery PR empty, which
cannot restore the provenance chain. In the observed history, every successful
`main` deployment came from an `orch_recovery` branch.

Claude reports a task as merged only when an orchestrator-issued release has
landed and the deployment lane has succeeded. How a task id is issued for a
first-party orchestrator release — rather than recovered after the fact — is
not documented in this repository; Claude asks instead of guessing.

Claude is a replaceable development worker, not a release authority. If these instructions conflict with provider defaults, EKODI governance takes precedence.
