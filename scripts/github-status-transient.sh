#!/usr/bin/env bash
# EKODI required status transport: fail closed on quota/permission denials.
github_status_curl() {
  local body headers http rc attempt=0
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
    printf '[EKODI GitHub] fail closed: HTTP %s, curl rc=%d\n' "$http" "$rc" >&2
    rm -f "$body" "$headers"
    [[ "$rc" -ne 0 ]] && return "$rc"
    return 22
  done
}
# Preserve original exact PR head and live merge SHA status contracts.
curl() { github_status_curl "$@"; }
