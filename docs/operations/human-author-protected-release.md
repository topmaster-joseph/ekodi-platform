# Human Author — guarded production schema release

**Owner:** EKODI Orchestrator | **Issue:** #6331 | **Data classification:** private author manuscripts and billing metadata

## Current verification

- Migration: `supabase/migrations/20261028010000_human_author_membership_writing.sql`.
- Development Supabase project: `lxcxwbdwwojjkgybbqii`, migration applied.
- Development verified: three tables have RLS; 4 owner policies; direct subscription creation / enrollment creation denied to normal members; anon reservation RPC denied; author answers only append by authenticated owner; service refuses paid author access without verified subscription.
- Production Supabase project: `renzehysxirjilvdxacv`; **do not assume schema exists**. Use preflight, never manually copy development data into production.
- Independent from Creator AI's existing `author` / `pro` payment subscription. No real billing, sale, or auto-publication activation in this migration.

## Protected promotion

1. Confirm the source PR has required exact-SHA CI success, EKODI Orchestrator provenance, and protected merge into `main`.
2. In the main GitHub workflow **Deploy Human Author Private Schema**, select `workflow_dispatch`, with:
   - `release_branch_ref`: existing official `ai/<agent>/orch_<task>` released branch.
   - `release_task_id`: matching official `orch_<task>` from the EKODI receipt.
   - `expected_main_sha`: exact 40-character SHA from the protected `main` branch.
3. The job must use the **production** GitHub environment, verify both the branch/task EKODI receipt and the exact main commit, then read development-only RLS proof.
4. Read-only production preflight checks existing canonical author tables. If *all* new tables and RPC are absent, apply the exact, versioned additive migration. If *all* are installed, skip writing and verify. A partially installed schema is an **incident**, not a reason to run a blind retry.
5. Read-only production postflight must pass 11 booleans. A failed check blocks completion; do not enable billing or create fake paid membership to make a smoke test pass.
6. Before marking production complete, verify the real Creator AI HTTPS route with an authorized non-production test account in its approved authentication context; create a disposable private author project, ensure another account cannot view it, and delete only those test artifacts.

**No automated bypass.** If credentials, owner-protected environment, receipt, or any dev/postflight security result is missing, the job fails without interpreting an absent test as success.

## After schema promotion: still separate work

- Entitlement reconciliation from real provider transactions into `human_author_subscriptions`, with cancellation, refund/chargeback and strict project quotas, is not part of this change.
- `human_author_interview_turns` currently contains human-supplied answers and editable interview prompts. It is **not** a generative AI conversation engine.
- EPUB3, ISBN, contracts, editorial graphic/accessibility signoff, signed publisher outbox, EKODI Books and Mall listings, real purchase/download/refund/royalty tests all require separate protected acceptance proofs.
- Keep both paid-plan enrollment and published product sale **disabled** until they pass.
