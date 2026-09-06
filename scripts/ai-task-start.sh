#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/ai-task-start.sh <agent> <task-id> [base-ref]

Creates or reuses an isolated EKODI task branch and a dedicated Git worktree.
Examples:
  bash scripts/ai-task-start.sh chatgpt admin-menu-fix
  bash scripts/ai-task-start.sh claude issue-742-policy main
EOF
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
  usage >&2
  exit 2
fi

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//; s/-+/-/g' \
    | cut -c1-64
}

agent=$(slugify "$1")
task_id=$(slugify "$2")
base_ref=${3:-main}

[[ -n "$agent" && -n "$task_id" ]]
[[ "$base_ref" != refs/* ]]
[[ "$base_ref" != *'..'* ]]
[[ "$base_ref" != *' '* ]]

repo_root=$(git rev-parse --show-toplevel)
repo_name=$(basename "$repo_root")
branch="ai/${agent}/${task_id}"
worktree_root="$(dirname "$repo_root")/.ekodi-worktrees/${repo_name}"
worktree_path="${worktree_root}/${agent}-${task_id}"

git check-ref-format --branch "$branch" >/dev/null
mkdir -p "$worktree_root"

git -C "$repo_root" fetch --prune origin "$base_ref"

if [[ -e "$worktree_path/.git" || -f "$worktree_path/.git" ]]; then
  current_branch=$(git -C "$worktree_path" branch --show-current)
  if [[ "$current_branch" != "$branch" ]]; then
    echo "Refusing to reuse $worktree_path because it is on $current_branch, expected $branch" >&2
    exit 1
  fi
else
  if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$repo_root" worktree add "$worktree_path" "$branch"
  elif git -C "$repo_root" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    git -C "$repo_root" fetch origin "$branch:$branch"
    git -C "$repo_root" worktree add "$worktree_path" "$branch"
  else
    git -C "$repo_root" worktree add -b "$branch" "$worktree_path" "origin/$base_ref"
    git -C "$worktree_path" push -u origin "$branch"
  fi
fi

base_sha=$(git -C "$repo_root" rev-parse "origin/$base_ref")
branch_sha=$(git -C "$worktree_path" rev-parse HEAD)

cat <<EOF
EKODI isolated task workspace ready
agent=$agent
task_id=$task_id
branch=$branch
worktree=$worktree_path
base_ref=$base_ref
base_sha=$base_sha
branch_sha=$branch_sha

Next:
  cd "$worktree_path"
EOF
