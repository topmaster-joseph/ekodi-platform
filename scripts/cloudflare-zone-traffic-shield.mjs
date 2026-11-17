#!/usr/bin/env node
// EKODI-EDGE-TRAFFIC-SHIELD-001 — zone edge layer for ekodi.kr.
//
// 2026-11-17 diagnosis (cloudflare-production-host-diagnose run 44100312471): the zone had
// no entrypoint ruleset in http_ratelimit, http_request_firewall_custom or
// http_request_firewall_managed. Every hostname — including the retired subdomain
// hosts that receive ~500 scanner requests a day each — reached Workers unfiltered,
// and every one of those requests spent Worker quota.
//
// This script owns only rules whose ref starts with "ekodi_edge_". Rules written by
// anyone else in the same phase are kept untouched and in order.
//
//   node scripts/cloudflare-zone-traffic-shield.mjs            # plan (read-only, default)
//   node scripts/cloudflare-zone-traffic-shield.mjs --apply    # write (main + dispatch only)
//
// Env: CLOUDFLARE_API_TOKEN, ZONE_ID (or CLOUDFLARE_ACCOUNT_ID to resolve ekodi.kr).

const API = 'https://api.cloudflare.com/client/v4';
const OWNED = /^ekodi_edge_/;

// Paths no EKODI service has ever served: WordPress/PHP/env/VCS probes. Blocking them at
// the edge costs nothing and removes scanner load from Workers. Verified absent from the
// repository route tables before adding (no route, asset or redirect uses these prefixes).
const SCANNER_PATHS = ['/wp-admin', '/wp-login.php', '/wp-content', '/wp-includes', '/xmlrpc.php', '/.env', '/.git/', '/phpmyadmin', '/vendor/phpunit', '/cgi-bin/'];

export function desiredRules() {
  const scanner = SCANNER_PATHS.map(path => path.endsWith('/') || !path.includes('.')
    ? `starts_with(lower(http.request.uri.path), "${path.toLowerCase()}")`
    : `lower(http.request.uri.path) eq "${path.toLowerCase()}"`).join(' or ');
  return {
    http_request_firewall_custom: [
      {
        ref: 'ekodi_edge_block_unsafe_methods',
        description: 'EKODI edge: TRACE/CONNECT/TRACK are never served',
        expression: '(http.request.method in {"TRACE" "CONNECT" "TRACK"})',
        action: 'block',
        enabled: true,
      },
      {
        ref: 'ekodi_edge_block_scanner_paths',
        description: 'EKODI edge: WordPress/PHP/env/VCS probes (no EKODI service uses these paths)',
        expression: `(${scanner})`,
        action: 'block',
        enabled: true,
      },
    ],
    http_ratelimit: [
      {
        ref: 'ekodi_edge_ip_flood_ceiling',
        description: 'EKODI edge: per-IP flood ceiling (Free plan: one rule, 10s window, 10s block). Counts cached assets too, so the threshold leaves room for a classroom behind one NAT.',
        expression: '(http.request.uri.path contains "/")',
        action: 'block',
        enabled: true,
        ratelimit: { characteristics: ['cf.colo.id', 'ip.src'], period: 10, requests_per_period: 3000, mitigation_timeout: 10 },
      },
    ],
  };
}

async function call(path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({ success: false, errors: [{ message: `HTTP ${response.status}` }] }));
  return { status: response.status, body };
}

async function resolveZone() {
  if (process.env.ZONE_ID) return process.env.ZONE_ID;
  const { body } = await call('/zones?name=ekodi.kr');
  const id = body?.result?.[0]?.id;
  if (!id) throw new Error('ekodi.kr zone not found: ' + JSON.stringify(body?.errors || []));
  return id;
}

export function mergeRules(existing = [], wanted = []) {
  const foreign = existing.filter(rule => !OWNED.test(String(rule.ref || '')));
  const strip = rule => Object.fromEntries(Object.entries(rule).filter(([key]) => ['ref', 'description', 'expression', 'action', 'enabled', 'ratelimit', 'action_parameters', 'logging'].includes(key)));
  return [...foreign.map(strip), ...wanted];
}

function same(a, b) {
  const pick = rule => JSON.stringify({ ref: rule.ref, expression: rule.expression, action: rule.action, enabled: rule.enabled, ratelimit: rule.ratelimit || null });
  return a.length === b.length && a.every((rule, i) => pick(rule) === pick(b[i]));
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is required');
  const zone = await resolveZone();
  const plan = await call(`/zones/${zone}`);
  console.log(`zone plan: ${plan.body?.result?.plan?.name || 'unknown'}`);
  let failures = 0;
  for (const [phase, wanted] of Object.entries(desiredRules())) {
    const current = await call(`/zones/${zone}/rulesets/phases/${phase}/entrypoint`);
    const existing = current.body?.success ? (current.body.result.rules || []) : [];
    const next = mergeRules(existing, wanted);
    const owned = existing.filter(rule => OWNED.test(String(rule.ref || '')));
    console.log(`\n=== ${phase}: ${existing.length} existing (${owned.length} EKODI-owned) -> ${next.length} rules`);
    for (const rule of wanted) console.log(`  + ${rule.ref}: ${rule.action} ${rule.ratelimit ? JSON.stringify(rule.ratelimit) : ''}`);
    if (same(existing, next)) { console.log('  no change'); continue; }
    if (!apply) { console.log('  plan only (pass --apply on main to write)'); continue; }
    const written = await call(`/zones/${zone}/rulesets/phases/${phase}/entrypoint`, { method: 'PUT', body: JSON.stringify({ rules: next }) });
    if (written.body?.success) {
      console.log(`  applied: ruleset ${written.body.result.id} v${written.body.result.version}`);
    } else {
      failures++;
      console.error(`  FAILED (${written.status}): ${JSON.stringify(written.body?.errors || written.body)}`);
    }
  }
  if (failures) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error.message || error); process.exit(1); });
