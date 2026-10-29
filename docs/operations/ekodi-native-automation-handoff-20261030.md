# EKODI-native automation ownership and ChatGPT task handoff (2026-10-30)

**Policy: EKODI Orchestrator alone decides, schedules, records and verifies automation.**
OpenAI/ChatGPT may be an opt-in callable tool used by an authorized EKODI workflow, never an autonomous scheduler or release approver.

## Measured legacy state

An authoritative read of the user's ChatGPT Automations on 2026-10-30 found **5 enabled records**. Four are active recurring workflows. The fifth (`EKODI 안정화 추적`) is still flagged enabled but has a finite RRULE (`COUNT=72`) whose previous schedule window elapsed. Twenty other legacy records were disabled, not counted as operating schedules. The older `config/ekodi-native-monitoring-ownership.json` contains the historical **intended** count 0 and an October 12 "confirmed" timestamp; that statement must not be interpreted as a current inventory or a cutover receipt.

The canonical live inventory for this migration is `config/ekodi-native-automation-handoff.json`; it contains job IDs, existing schedule records, owner, parity blockers and native first-party routes. Do not copy ChatGPT prompts, user emails, OAuth tokens, document contents or provider secrets into the repository.

## EKODI-owned execution

- Existing base: `ekodi-native-operations-watch.yml` (hourly/daily), `watch-ekodi-church-source.yml` (15-minute), `reconcile-orchestrator-completions.yml` (15-minute), `system-health-analytics.yml`.
- Additional own-scheduler: `.github/workflows/ekodi-native-handoff-watch.yml`. Runs hourly at minute 43, Mondays at 08:00 KST and Wednesdays at 08:26 KST. Triggering is **GitHub Actions owned by EKODI**, not OpenAI's scheduled tasks. GitHub Actions is an infrastructure executor; its result is still validated by the EKODI Orchestrator.
- Code: `scripts/ekodi-native-handoff-watch.mjs`. Read-only GitHub and first-party public source checks. Exact owner declared. No POST, no merchant order, no email, no ChatGPT/OpenAI API, no direct merge, no deployment, no database writes. Artifacts have bounded 14-day retention and never contain credentials.
- `workflow_dispatch` profile can exercise read-only evidence manually; it does **not** authorize editing or publishing.
- A successful workflow result means **monitor execution**, not **handoff of document creation or verified deployment**.

## Task-specific execution boundary

1. Social accounts: native first-party monitoring may inspect GitHub releases, but authorized real login and UI E2E proof is still required before ChatGPT scheduled monitoring is turned off.
2. Church Live: native church source and approved release path already exist. Verify exact source SHA vs public release, role-scoped studio and anonymous viewer before cutover.
3. EKODI Human Publishing: `publishing/human/editorial-policy.js` prepares six deterministic monthly slots but **does not** write manuscripts, store Google Docs, approve rights or release titles. Building an authenticated EKODI editorial persistence/authoring/approval pipeline is a separate required integration. Do not call planned slots 'books published'.
4. Church weekly worship: next Sunday scripture can be read from the **approved** `config/common-scripture/YYYY-MM.json` daily registry. It is not independently a pastor-approved sermon/lectionary. No sermon, bulletin or Google Slides has been created by this read-only observer; integrate authorized EKODI-owned Google Docs/Slides writer and owner approval first.
5. P0/P1 stability: previous ChatGPT `COUNT=72` watcher is expired, not a reason to spin up another unrestricted runner. Native Orchestrator reconciliation and operations watch own the relevant ongoing status evidence.
6. Common header PR #6869: native hourly evidence tracks the official PR and existing Shell runs without asserting production success from a merge alone.

## Cutover checklist (all required per task)

- [ ] EKODI official protected PR, exact HEAD CI, constitution/security, conflict guard, provenance and authorized merge.
- [ ] EKODI scheduler first real successful post-merge `schedule` or authorized `workflow_dispatch` run with nonexpired evidence artifact.
- [ ] Behavioral parity: outputs/notifications, publication artifacts and recipients where applicable; checks on both failure and recovery.
- [ ] Durable leases/idempotency keys or only-one-source write ownership to avoid duplicated content, orders and notices.
- [ ] Signed owner/pastor/publisher human approval where the business flow requires it.
- [ ] Authorized EKODI production source readback and PC/mobile evidence if the task touches user-facing pages.
- [ ] Only after **each** job meets every required proof may the corresponding ChatGPT scheduled task be individually disabled via user-authorized tool, with a confirmation receipt and one-time rollback plan.
- [ ] If the job is not yet equivalent, keep old execution as a bounded fallback instead of quietly dropping it. Never claim 'all migrated' on the basis of the new monitoring workflow.

## Guardrails

No new OpenAI scheduled automations. No external AI credentials. ChatGPT task IDs are transition references only; do not log entire prompts. Human approval gates, paid API limitations, financial release restrictions and site/server role checks remain intact. The operational dashboard must distinguish `shadow_read_only`, `native_verified`, `cutover_ready` and `cutover_complete` and display missing evidence explicitly.
