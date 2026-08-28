#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <database> <config> <wrangler-version>" >&2
  exit 2
fi

DB="$1"
CONFIG="$2"
WRANGLER_VERSION="$3"
MAX_ATTEMPTS="${D1_MIGRATION_ATTEMPTS:-4}"

is_nonproduction_target=false
case "${DB}|${CONFIG}" in
  *staging*|*development*|*preview*) is_nonproduction_target=true ;;
esac

if [[ "${GITHUB_ACTIONS:-}" == "true" && "$is_nonproduction_target" != "true" ]]; then
  event="${GITHUB_EVENT_NAME:-}"
  ref="${GITHUB_REF:-}"
  if [[ "$ref" != "refs/heads/main" || "$event" == "pull_request" || "$event" == "pull_request_target" ]]; then
    echo "Production D1 migration blocked: remote production writes are allowed only from refs/heads/main and never from pull requests (event=${event:-unknown}, ref=${ref:-unknown}, db=$DB, config=$CONFIG)." >&2
    exit 3
  fi
fi

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  log="$(mktemp)"
  if npx --yes "wrangler@${WRANGLER_VERSION}" d1 migrations apply "$DB" --remote --config "$CONFIG" >"$log" 2>&1; then
    cat "$log"
    rm -f "$log"
    exit 0
  fi

  cat "$log" >&2
  if grep -Eiq 'UNIQUE constraint failed: d1_migrations\.name|already applied|no migrations to apply' "$log" && [[ "$attempt" -lt "$MAX_ATTEMPTS" ]]; then
    echo "D1 migration registry changed concurrently; re-reading migration state (attempt $attempt/$MAX_ATTEMPTS)." >&2
    rm -f "$log"
    sleep $((attempt * 2))
    continue
  fi

  rm -f "$log"
  exit 1
done

exit 1
