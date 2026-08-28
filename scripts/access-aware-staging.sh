#!/usr/bin/env bash
# Cloudflare Access-aware staging verification helper.
# Source this file from a staging verification step, call
# access_aware_staging_start <wrangler-config> <remote-url> [port], then point
# STAGING_URL at $STAGING_VERIFY_URL. The helper never disables Cloudflare
# Access. When Access protects a stateless Worker, it runs the exact staging
# config locally for runtime contract checks while separately proving the
# remote deployment exists in the Development account.

ACCESS_AWARE_STAGING_PID=""
ACCESS_AWARE_STAGING_LOG=""

access_aware_staging_start() {
  local config="${1:?wrangler config is required}"
  local remote_url="${2:?remote staging URL is required}"
  local port="${3:-8790}"
  local wrangler_version="${WRANGLER_VERSION:-4.119.0}"
  local headers body code ready local_url

  test -f "$config" || { echo "Staging config not found: $config" >&2; return 20; }
  case "$remote_url" in
    https://*.ekodi-development.workers.dev*) ;;
    *) echo "Refusing Access-aware verification outside Development workers.dev: $remote_url" >&2; return 21 ;;
  esac

  # Prove that a real deployment exists before any local fallback is allowed.
  npx --yes "wrangler@${wrangler_version}" deployments status --config "$config" --json > /tmp/access-aware-deployments.json
  test -s /tmp/access-aware-deployments.json

  headers="/tmp/access-aware-staging.headers"
  body="/tmp/access-aware-staging.body"
  code="000"
  for attempt in $(seq 1 12); do
    code=$(curl -sS -D "$headers" -o "$body" -w '%{http_code}' --connect-timeout 5 --max-time 15 "${remote_url%/}/" || true)
    if [[ "$code" != "000" ]]; then break; fi
    sleep 2
  done

  export STAGING_REMOTE_PROTECTED="false"
  export STAGING_VERIFY_URL="${remote_url%/}"

  if [[ "$code" =~ ^30[12378]$ ]] && grep -Eiq '^www-authenticate:[[:space:]]*Cloudflare-Access' "$headers"; then
    export STAGING_REMOTE_PROTECTED="true"
    echo "Remote staging is protected by Cloudflare Access. Access stays enabled; validating the exact staging config locally."

    # Local fallback is intentionally limited to stateless staging configs.
    # Stateful Workers must use a dedicated authenticated/remote test lane so
    # an empty local D1/KV/R2 cannot create false confidence.
    if grep -Eiq '^\s*\[\[(d1_databases|kv_namespaces|r2_buckets|queues\.|services)\]\]|^\s*\[durable_objects\]' "$config"; then
      echo "Stateful staging config is Access-protected; refusing stateless local fallback: $config" >&2
      return 22
    fi

    local_url="http://127.0.0.1:${port}"
    ACCESS_AWARE_STAGING_LOG="/tmp/access-aware-staging-${port}.log"
    npx --yes "wrangler@${wrangler_version}" dev --config "$config" --local --port "$port" >"$ACCESS_AWARE_STAGING_LOG" 2>&1 &
    ACCESS_AWARE_STAGING_PID=$!
    export ACCESS_AWARE_STAGING_PID ACCESS_AWARE_STAGING_LOG

    ready=0
    for attempt in $(seq 1 30); do
      if ! kill -0 "$ACCESS_AWARE_STAGING_PID" 2>/dev/null; then
        cat "$ACCESS_AWARE_STAGING_LOG" >&2 || true
        return 23
      fi
      code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 "${local_url}/" || true)
      if [[ "$code" != "000" ]]; then ready=1; break; fi
      sleep 1
    done
    if [[ "$ready" != "1" ]]; then
      cat "$ACCESS_AWARE_STAGING_LOG" >&2 || true
      return 24
    fi
    export STAGING_VERIFY_URL="$local_url"
  elif [[ "$code" == "000" ]]; then
    echo "Remote staging endpoint could not be reached: $remote_url" >&2
    return 25
  fi

  echo "Staging verification endpoint: $STAGING_VERIFY_URL (remote protected: $STAGING_REMOTE_PROTECTED)"
}

access_aware_staging_stop() {
  if [[ -n "${ACCESS_AWARE_STAGING_PID:-}" ]]; then
    kill "$ACCESS_AWARE_STAGING_PID" 2>/dev/null || true
    wait "$ACCESS_AWARE_STAGING_PID" 2>/dev/null || true
    ACCESS_AWARE_STAGING_PID=""
  fi
}
