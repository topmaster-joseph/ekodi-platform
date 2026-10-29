#!/usr/bin/env bash
# CF-QUOTA-001: shared, fail-closed HTTP transport for authenticated Admin E2E.
# Source from the short-lived session issuance/revocation workflow steps.
# Do not log response bodies: Cloudflare D1 responses can contain private data.
ekodi_cf_initialize() {
  export EKODI_CF_QUOTA_FLAG="${RUNNER_TEMP:-/tmp}/ekodi-admin-e2e-cf-quota-${GITHUB_RUN_ID:-$$}-${GITHUB_JOB:-session}"
  # Deliberately do not clear an existing marker: workflow steps share this job-level circuit.
  # The marker is scoped to GITHUB_RUN_ID and GITHUB_JOB; cleanup must not retry after 429.
}

ekodi_cf_assert_clean() {
  if [[ -f "${EKODI_CF_QUOTA_FLAG:-/nonexistent}" ]]; then
    echo '::error title=CF-QUOTA-001::Cloudflare quota circuit is open; abort before the next request.' >&2
    return 75
  fi
}

ekodi_cf_request() {
  ekodi_cf_assert_clean || return 75
  local body status curl_result=0
  body="$(mktemp)" || return 1
  # --retry 0 is deliberate: curl automatically retries HTTP 429 when retries are enabled.
  status="$(curl -sS --retry 0 --output "$body" --write-out '%{http_code}' "$@")" || curl_result=$?
  if [[ "$status" == '429' ]] || grep -Eiq '("code"[[:space:]]*:[[:space:]]*1027([^0-9]|$)|error[[:space:]:#-]*1027)' "$body"; then
    : > "$EKODI_CF_QUOTA_FLAG"
    rm -f "$body"
    echo '::error title=CF-QUOTA-001::First Cloudflare HTTP 429 or error 1027; no retry and no further requests.' >&2
    return 75
  fi
  if [[ "$curl_result" -ne 0 || ! "$status" =~ ^2[0-9][0-9]$ ]]; then
    rm -f "$body"
    echo "::error title=Cloudflare E2E request failed::HTTP ${status:-unknown}, curl exit $curl_result (no retry)." >&2
    return 22
  fi
  cat "$body"
  rm -f "$body"
}
