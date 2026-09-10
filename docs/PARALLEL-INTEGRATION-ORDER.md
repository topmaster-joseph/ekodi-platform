# EKODI Parallel Integration Order

Parallel work stays isolated by branch and worktree. EKODI compares each pull request with other open pull requests before integration. The comparison covers both exact file overlap and configured related-change scopes, so similar admin menu, navigation, routing, and access-policy work cannot silently pass each other merely because different files were edited.

## Related-change cross-review

When exact or related-change overlap is detected, the current PR remains blocked until EKODI reviews the detected PRs together. Review must compare intent, changed files or diff, tests, integration order, and whether one change supersedes or must be reconciled with another.

The selected PR must carry `related-change-review-complete` and include review evidence containing `[EKODI RELATED CHANGE REVIEW]` plus every detected related PR number. The evidence is the auditable record that ongoing related work was actually cross-reviewed rather than only file-scanned.

## Central integration winner

After cross-review, the platform integrator may select exactly one PR in the related conflict cluster by applying `integration-order-approved`.

The conflict guard allows that PR to merge first only when:

- exactly one PR in the detected cluster has `integration-order-approved`;
- the selected PR has `related-change-review-complete` and complete related-PR evidence;
- GitHub still reports no actual merge conflict with `main`;
- all normal validation, security, constitutional and release gates remain applicable.

The labels do not waive tests, reviews, branch protection, authorization or deployment safeguards.

## Remaining PRs

Every overlapping or related PR that was not selected must refresh or rebase on the new `main` after the winner merges, repeat related-change detection, and rerun validation. Its work remains independent and is not discarded merely because another PR merged first.
