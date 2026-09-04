# EKODI Parallel Integration Order

Parallel work stays isolated by branch and worktree. When two or more open pull requests touch the same file, the default is fail-closed: none may silently race into `main`.

## Central integration winner

The platform integrator may select exactly one PR in an overlapping conflict cluster by applying the `integration-order-approved` label.

The conflict guard allows that PR to merge first only when:

- exactly one PR in the detected overlap cluster has the label;
- GitHub still reports no actual merge conflict with `main`;
- all normal validation, security, constitutional and release gates remain applicable.

The label does not waive tests, reviews, branch protection, authorization or deployment safeguards.

## Losing PRs

Every overlapping PR that was not selected must refresh or rebase on the new `main` after the winner merges, then rerun its validation. Its work remains independent and is not discarded merely because another PR merged first.
