#!/usr/bin/env bash
# EKODI required status transport: fail closed on quota/permission denials.
# Append bounded, non-secret evidence to the existing GitHub Actions job summary.
# This performs no GitHub API request and never includes response text/headers.
ekodi_github_status_note() {
  local kind="${1:-unknown}" code="${2:-0}" attempts="${3:-0}"
  case "$kind" in
    quota_primary|quota_secondary|rate_limited_429|permission_denied|authentication_denied|validation_denied|transient_exhausted|transport_error|other_denial|quota_circuit_suppressed) ;;
    *) kind='other_denial' ;;
  esac
  [[ "$code" =~ ^[0-9]{3}$ ]] || code='000'
  [[ "$attempts" =~ ^[0-2]$ ]] || attempts='0'
  if [[ "${GITHUB_ACTIONS:-}" == 'true' &&
        -n "${GITHUB_STEP_SUMMARY:-}" &&
        -f "${GITHUB_STEP_SUMMARY:-}" &&
        -w "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '\n- EKODI GitHub status transport: `%s` · HTTP `%s` · transient retries `%s` · this request did not publish success; check outcome requires independent verification. No credentials recorded.\n' \
      "$kind" "$code" "$attempts" >> "$GITHUB_STEP_SUMMARY" || :
  fi
}
# EKODI-STATUS-RATE-WAIT-001
# Measured 2026-11-12 on the orchestration gate of a recovery PR:
#   [EKODI GitHub] {"status":403,"classification":"primary_rate_limit",
#                   "resource":"core","remaining":0,"limit":5000,"resetAt":...}
#   [EKODI GitHub] fail closed: HTTP 403, curl rc=22
# Every test had passed; only this status publication failed, and it failed with
# the reset time in hand. The release parked.
#
# So: wait once, but ONLY when the response itself says when to come back
# (retry-after, or x-ratelimit-reset), and only when that is inside the cap.
# No header means no wait — guessing a delay would turn a definite refusal into
# a silent stall, and a permission 403 must never wait at all.
ekodi_github_status_wait_seconds() {
  local headers="${1:-}" cap="${2:-150}" reset='' retry='' now wait
  [[ -f "$headers" ]] || return 0
  [[ "$cap" =~ ^[0-9]{1,4}$ ]] || cap=150
  retry=$(grep -Eio '^retry-after:[[:space:]]*[0-9]+' "$headers" 2>/dev/null | grep -Eo '[0-9]+$' | head -1)
  reset=$(grep -Eio '^x-ratelimit-reset:[[:space:]]*[0-9]+' "$headers" 2>/dev/null | grep -Eo '[0-9]+$' | head -1)
  now=$(date -u +%s)
  if [[ -n "$retry" ]]; then
    wait="$retry"
  elif [[ -n "$reset" ]]; then
    wait=$((reset - now + 2))
  else
    return 0
  fi
  [[ "$wait" -le 0 ]] && wait=1
  [[ "$wait" -gt "$cap" ]] && return 0
  printf '%s' "$wait"
}
github_status_curl() {
  local body headers http rc attempt=0 marker='' waited=0
  # Block further status calls in this exact job after measured quota exhaustion.
  # GitHub permissions 403 is not automatically a quota error.
  if [[ -n "${RUNNER_TEMP:-}" && -d "${RUNNER_TEMP:-}" &&
        "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ &&
        "${GITHUB_RUN_ATTEMPT:-1}" =~ ^[0-9]+$ &&
        "${GITHUB_JOB:-}" =~ ^[A-Za-z0-9_-]+$ ]]; then
    marker="${RUNNER_TEMP}/ekodi-github-quota-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT:-1}-${GITHUB_JOB}"
    if [[ -f "$marker" ]]; then
      ekodi_github_status_note quota_circuit_suppressed 429 0
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
    # Emit only fixed labels and measured numeric status, never raw API data.
    # A permission-only 403 must not be labelled as quota exhaustion.
    local status_kind='other_denial'
    if [[ "$http" == '429' ]]; then
      status_kind='rate_limited_429'
    elif [[ "$http" == '403' ]]; then
      if grep -Eiq '^x-ratelimit-remaining:[[:space:]]*0([[:space:]]|$)' "$headers"; then
        status_kind='quota_primary'
      elif grep -Eiq 'rate limit exceeded|secondary rate limit' "$body"; then
        status_kind='quota_secondary'
      else
        status_kind='permission_denied'
      fi
    elif [[ "$http" == '401' ]]; then
      status_kind='authentication_denied'
    elif [[ "$http" == '422' ]]; then
      status_kind='validation_denied'
    elif [[ "$http" =~ ^(500|502|503|504|000)$ ]]; then
      status_kind='transient_exhausted'
    elif [[ "$rc" -ne 0 ]]; then
      status_kind='transport_error'
    fi
    # Wait once for a measured quota reset, then one retry. Only quota-classified
    # refusals qualify: permission_denied, authentication_denied and
    # validation_denied fall straight through to fail closed as before.
    if [[ "$waited" -eq 0 ]] &&
       [[ "$status_kind" == 'quota_primary' || "$status_kind" == 'quota_secondary' || "$status_kind" == 'rate_limited_429' ]]; then
      local wait_s
      wait_s=$(ekodi_github_status_wait_seconds "$headers" "${EKODI_STATUS_RATE_WAIT_CAP_S:-150}")
      if [[ -n "$wait_s" ]]; then
        waited=1
        printf '[EKODI GitHub] %s resets in %ss; waiting once then retrying once\n' "$status_kind" "$wait_s" >&2
        sleep "$wait_s"
        continue
      fi
    fi
    ekodi_github_status_note "$status_kind" "$http" "$attempt"
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
