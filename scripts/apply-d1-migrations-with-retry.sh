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
