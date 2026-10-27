# Secure Documents — independent security review / protected release

**Current status: blocked; no live PII collection.** This service is a separately protected document vault, not the credential vault; national identity documents and unredacted resident registration numbers are excluded.

## Split responsibilities
- Builder: implementation and deterministic static checks. May not approve own high-impact release.
- Independent security reviewer: auth, crypto, scanner, redaction, storage access, token lifecycle, replay/races, backups and incident response. Review must refer to the exact head SHA.
- Qualified privacy/legal reviewer: document classes, purpose limitation, residency, overseas processing, legal retention, minimization and requested user/organization sharing authorization. An AI code review is not legal approval.
- EKODI Orchestrator: collects signed evidence and guarded deployment receipts; never reclassifies failed checks as approvals.
- EKODI owner: authenticates approval for the exact task/state/SHA through existing Human Gate. Plain administrator text or PR merge does not replace that receipt.

## Required synthetic-file tests
1. Registration of **fake** document bytes only, scanner safely rejects malformed/unsafe PDFs, unauthorized types and unredacted details.
2. Verify encryption at rest and key rotation/restore and backup recovery without exposing plaintext or raw keys.
3. Person A cannot read person B; tenant A cannot read tenant B; tenant admin cannot read personal vault; platform admin does not gain default access.
4. Recipient without verified EKODI login or fresh MFA cannot open; wrong-recipient email cannot open; expired, revoked or exhausted tokens fail.
5. Simultaneous view claims do not exceed max_views; rate limiting handles abuse; audit never logs content or raw token.
6. Share expiry rejects future downloads synchronously; scheduler state and temporary artefact deletion reconcile.
7. Original deletion respects explicit retention and legal hold; purge verifies stored object removal, backup lifecycle and audit receipts.
8. PC/mobile route and activation status verified on actual domain; no secret fields in URL requests, analytics, AI model prompts or cache.

## Release path
- A separate pull request on `ai/<agent>/<task-id>` is required, validated by `EKODI AI Orchestration Gate`, `test` and this static check.
- Draft PR: check code and security while **not** reconciling merge-ready statuses. Transition to ready-for-review only after all review evidence is prepared.
- Independent reviewer signoff and privacy review evidence must exist for exact head SHA; branch rules with `requiredApprovingReviewCount=0` do not substitute for this service's gate.
- The separate activation validator `node scripts/validate-secure-documents-security.mjs --release` fails while `config/secure-documents-release-policy.json` is `blocked`. A future change to `approved` must itself pass independent evidence checks and protected Orchestrator owner-gated deployment; simply flipping fields in JSON is not sufficient.
- Stage synthetic canary, protect code merge, deploy default OFF, verify live host, then authorize limited activation with no raw IDs until legal permission is documented.
- On any verification failure: leave runtime OFF; investigate, fix, rerun exact-SHA checks; use protected rollback and never bypass release gate.

## Records
PR: https://github.com/topmaster-joseph/ekodi-platform/pull/6330
Orchestrator tracker: https://github.com/topmaster-joseph/ekodi-platform/issues/6337
