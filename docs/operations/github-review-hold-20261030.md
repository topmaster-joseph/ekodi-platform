# EKODI Orchestrator review-hold budget circuit — issue 6630

Root cause: a PR with an outstanding GitHub sovereign-human CHANGES_REQUESTED
review was repeatedly synchronized to moving main and retriggered full CI,
Gate, and convergence runs before GitHub would reject the protected merge.
This consumed shared hourly REST quota without any merge progress.

Reuse the existing convergent release workflow:
- After authoritative release receipt and exact-head PR lookup, use read-only
  GitHub REST reviews before file scan, branch synchronization or writes.
  Trust only the canonical owner or GitHub-declared OWNER/MEMBER/COLLABORATOR;
  arbitrary public reviews must never prevent an otherwise protected merge.
- An unresolved latest CHANGES_REQUESTED review blocks all syncs/merge/status
  writes and exits with honest \`human-review-hold\` evidence. COMMENTED never
  overrides a requested change. Missing or inaccessible reviews fail closed.
- A real APPROVED review submitted by \`topmaster-joseph\` on a same-repository
  PR triggers the EXISTING workflow, not another scheduler or release lane.
  Do not self-approve, dismiss a review, forge statuses, or change protection.
- For review events check out the event's immutable head SHA, pin task branch
  context, and keep per-branch concurrency. The existing release receipt, exact
  SHA tests, and GitHub protected merge continue to own all mutation authority.
- No new provider, GitHub App token, workers, budgets, credentials or paid
  services. Distinct from draft source PR #7003 authenticated ETag/403 circuit
  and from official #6995 disabled shared D1 admission ledger.

Tests:
node --test test/converge-review-hold.test.mjs \
  test/converge-update-branch-retrigger-20261019.test.mjs \
  test/converge-per-branch-concurrency-20261020.test.mjs \
  test/orchestrated-pr-continuity.test.mjs

Do not claim merged or released before official protected CI/PR and live canary.
