#!/usr/bin/env bash
# EKODI required status transport: fail closed on quota/permission denials.
# Source in the narrow publish/revoke steps only, never in all of CI.
github_status_curl() {
  local body http rc attempt=0
  body=$(mktemp) || return 1
  while :; do
    rc=0
    http=$(command curl --connect-timeout 6 --max-time 18 \
      -o "$body" -w '%{http_code}' "$@") || rc=$?
    if [[ "$rc" -eq 0 && "$http" =~ ^2[0-9][0-9]$ ]]; then
      cat "$body"
      rm -f "$body"
      return 0
    fi
    # Strictly limit to transient GitHub service faults, max 2 retries.
    # 403, 429, 401 and 422 never retry and cannot become green.
    if [[ "$attempt" -lt 2 && "$http" =~ ^(000|500|502|503|504)$ ]]; then
      attempt=$((attempt+1))
      printf '[EKODI GitHub] transient HTTP %s; retry %d/2\n' "$http" "$attempt" >&2
      sleep "$attempt"
      continue
    fi
    printf '[EKODI GitHub] fail closed: HTTP %s, curl rc=%d\n' "$http" "$rc" >&2
    rm -f "$body"
    [[ "$rc" -ne 0 ]] && return "$rc"
    return 22
  done
}
# Preserve existing exact PR head + live merge-SHA status contracts.
curl() { github_status_curl "$@"; }
