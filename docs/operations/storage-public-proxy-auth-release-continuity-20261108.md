# EKODI Storage public API boundary — protected release checkpoint

Date: 2026-11-08 Asia/Seoul. Task `storage-public-host-auth-20261108`.

## Authenticated source and release identity

- Source worker PR #8769 was closed unmerged after EKODI Orchestrator issued official recovery PR #8770.
- Preserved functional source SHA `38f286040bb01a749425ffa89254606fd3021c03`.
- The source-specific authentic CI run `42385540318`, AI Orchestration Gate `42385540310`, Supabase Local CI `42385540328`, Storage and External AI Contracts `42385540316`, Constitution Check `42385540261`, and parallel guard `42385540473` completed successfully.
- Initial bot-authored PR head `9caf8189d144aa6cd57a27ba9bd86988499ebfd2` had GitHub `action_required` placeholders, not proof of executed green tests. This note on the existing official recovery branch requests **fresh, owner-connected authentic checks at latest source head** without forging statuses, bypassing approvals or merging directly.

## Security scope and non-completion

The underlying code continues to require the existing `EKODI_STORAGE_GATEWAY_KEY` at the public Control API before invoking the privileged Storage service binding; an untrusted Host value does not grant internal identity. The canonical internal Storage Worker still handles its explicitly internal service-binding routes without adding a parallel provider, account, key or privileged write.

No Supabase table was modified, no customer data exported, no financial points activated, no shared Drive permissions changed. This documentation-only checkpoint does not constitute a completed guarded Control API production deployment or an authenticated live 401/authorized request verification. Those evidence gates still apply and will be verified separately once the EKODI Orchestrator performs its protected merge and release.

Do not merge the worker PR or skip protected CI. If official checks fail, keep the recovery PR unmerged and repair the actual failure on an isolated task branch.
