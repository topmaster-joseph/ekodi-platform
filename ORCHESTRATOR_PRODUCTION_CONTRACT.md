# EKODI Orchestrator Production Contract

This contract closes issue #1784's authority gap without making an external AI the execution owner.

## Authority

EKODI Orchestrator owns every accepted execution task from receipt through production verification. GitHub issues, pull requests, Actions, Cloudflare and external AIs are transports or workers, never the task authority.

## Lifecycle

`received -> triaged -> assigned -> executing -> validating -> pr_gates -> staging -> deploying -> production_verifying -> completed`

`blocked`, `failed`, and `cancelled` are terminal/non-success states. A task with `deployment_requested=1` MUST NOT enter `completed` without production evidence.

## Delegated production authority

A Super Administrator instruction to implement and complete a specific requested change is delegated production authority for that task, subject to existing guarded release controls. The Orchestrator may automatically select and retry authorized cloud execution paths and run the existing guarded production release after required gates pass.

Fresh approval remains mandatory for authority expansion, security-boundary changes, destructive/irreversible operations, new paid commitments, credential disclosure or provider-required login/consent/MFA. A missing optional adapter, connector quota, or unavailable workflow-dispatch UI is not an approval boundary; the Orchestrator must fail over to another authorized path.

## Completion evidence

For deployment tasks, completion requires durable evidence of the release artifact/ref, required gates, production endpoint/health verification, and post-deployment regression/security verification. Workers report evidence; only the Orchestrator settles the authoritative state.

## External AI contract

External AI clients submit intent and identity through an authorized EKODI entry adapter, receive `task_id`, and read authoritative status/results. They must not infer completion from a GitHub merge or workflow status alone.
