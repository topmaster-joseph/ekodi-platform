#!/usr/bin/env bash
# EKODI required status transport: fail closed on quota/permission denials.
github_status_curl() {
  local body headers http rc attempt=0 marker=''
  # Block further status calls in this exact job after measured quota exhaustion.
  # GitHub permissions 403 is not automatically a quota error.
  if [[ -n "${RUNNER_TEMP:-}" && -d "${RUNNER_TEMP:-}" &&
        "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ &&
        "${GITHUB_RUN_ATTEMPT:-1}" =~ ^[0-9]+$ &&
        "${GITHUB_JOB:-}" =~ ^[A-Za-z0-9_-]+$ ]]; then
    marker="${RUNNER_TEMP}/ekodi-github-quota-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT:-1}-${GITHUB_JOB}"
    if [[ -f "$marker" ]]; then
      printf '[EKODI GitHub] job quota circuit open; no more HTTP attempts, required gate remains blocked\n' >&2
      return 22
    fi
  fi
  body=$(mktemp) || return 1
  headers=$(mktemp) || { rm -f "$body"; return 1; }
  while :; do
    rc=0
    : > "$body"
    : > "$headers"
    http=$(command curl --connect-timeout 6 --max-time 18 \
      -D "$headers" -o "$body" -w '%{http_code}' "$@") || rc=$?
    if [[ "$rc" -eq 0 && "$http" =~ ^2[0-9][0-9]$ ]]; then
      cat "$body"
      rm -f "$body" "$headers"
      return 0
    fi
    # Existing bounded transient-only retry. No retry on 401/403/429/422.
    if [[ "$attempt" -lt 2 && "$http" =~ ^(000|500|502|503|504)$ ]]; then
      attempt=$((attempt+1))
      printf '[EKODI GitHub] transient HTTP %s; retry %d/2\n' "$http" "$attempt" >&2
      sleep "$attempt"
      continue
    fi
    # Never log raw response headers/body, URL, actor or authorization.
    if [[ "$http" =~ ^[0-9]{3}$ && -f scripts/github-http-diagnostic.mjs ]]; then
      node scripts/github-http-diagnostic.mjs "$http" "$headers" "$body" >&2 ||
        printf '[EKODI GitHub] diagnostic unavailable\n' >&2
    fi
    # Record only quota-classified responses; no tokens or response data stored.
    if [[ -n "$marker" ]] && {
      [[ "$http" == '429' ]] ||
      { [[ "$http" == '403' ]] && {
        grep -Eiq '^x-ratelimit-remaining:[[:space:]]*0([[:space:]]|$)' "$headers" ||
        grep -Eiq 'rate limit exceeded|secondary rate limit' "$body"
      }; }
    }; then
      : > "$marker" 2>/dev/null || true
    fi
    printf '[EKODI GitHub] fail closed: HTTP %s, curl rc=%d\n' "$http" "$rc" >&2
    rm -f "$body" "$headers"
    [[ "$rc" -ne 0 ]] && return "$rc"
    return 22
  done
}
# Preserve original exact PR head and live merge SHA status contracts.
curl() { github_status_curl "$@"; }
