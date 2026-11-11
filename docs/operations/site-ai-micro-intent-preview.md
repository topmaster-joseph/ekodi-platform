# EKODI Site AI Micro-Intent Preview — first integrated vertical slice

Owner-approved orchestrator task: `orch_ca0ccbc9-c315-4e19-85bd-1d8fd60ab772`. Source branch: `ai/ekodi-admin/orch_ca0ccbc9-c315-4e19-85bd-1d8fd60ab772`. Related issues: #9164, #9322, #9323, #9329.

## Implemented boundary

Read-only, same-origin, platform-Super-Admin **preview only** at:

`POST /api/control/ai/v8/site-ai/intent-preview`

The server requires a currently authenticated `super_admin` with `ai:read`, exact same-origin and JSON content type. Its site/capability candidates come from EKODI's installed registries. Free-form user text cannot supply extra capabilities, privileged role, or an immutable `workspace_id`.

Request example (send only from authenticated EKODI Control, not from an external website):

```json
{"siteId":"ekodi-church","scope":"site_specific","action":"repair","capabilityId":"core.automation","codeChange":true}
```

This returns only a proposal: site-local ownership, site-native administrator detail path, whether exact Human Gate/release verification is required, and the enforced free-first, Core-fallback and KRW 0 automatic paid budget policy. It does **not** issue task IDs, authenticate tenant mutations, send notifications, pay API fees, deploy code or train model weights. `site.id` is a lookup key and must never replace canonical immutable `workspace_id` for authorization.

The existing `capability-intent-runtime.js` remains the intent-to-capability recommender. This narrower adapter starts *after* a registered capability and site candidate have been selected; it cannot add unknown capabilities. Existing `ai-free-quota.js`, `free-tier-quota-guard.js`, `ekodi-learning-loop.js`, and `notification-control.js` remain the correct implementations for cost, learning, and dispatch.

## Next guarded integrations

1. Site-native authenticated executor obtains immutable workspace ID and membership grants before any mutation.
2. Orchestrator attaches an actual delegated task receipt and requires required preflight + bounded replay-safe state machine.
3. Notification service creates actual owner inbox/Web Push notices for high-impact tasks; eligible Kakao/SMS only with separate policy and spend receipts.
4. Learning loop uses independently verified site-local outcomes (not speculative model output) and can propose shared playbook promotion under existing review.
5. The user-facing Control UI can render these plans, with **자세히** linking to the authenticated native site admin; no duplicate platform-wide site-detail editor.
6. A separate physical-AI adapter remains simulation-only until independent on-site safety authorization.
7. Complete protected PR checks, staging, guarded release and functional live-host verification before closing the task.

No success is claimed outside this scope. A deployed endpoint is not evidence of executed site changes.
