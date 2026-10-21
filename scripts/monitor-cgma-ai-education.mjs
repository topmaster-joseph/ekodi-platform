// Independent, read-only health watch for the CGMA 상인 AI 교육 수요조사 (CGMA-AIEDU-RETIRE-001).
//
// Proves on ekodi.kr that the survey is served by the D1-backed operating survey from
// topmaster-joseph/cheonggye-market via cgma-root-gateway, and that the retired Shared Site guard
// (x-ekodi-route: cgma-ai-education-retired-prototype) is never what visitors receive. A guard
// response means the gateway route was bypassed: an anomaly, reported as `gateway_bypass`.
//
// Never submits survey answers, never reads private statistics (expects 401), never logs bodies.
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ORIGIN = 'https://ekodi.kr';
const HEADERS = Object.freeze({ accept: 'text/html,application/json,text/javascript', 'cache-control': 'no-cache', 'user-agent': 'EKODI-CGMA-ai-education-health/1.0' });
export const GUARD_ROUTE = 'cgma-ai-education-retired-prototype';
export const TARGETS = Object.freeze([
  { path: '/cgma/ai-education/', kind: 'page', route: 'cgma-ai-education-survey', marker: 'id="survey"' },
  { path: '/cgma/ai-education/app.js', kind: 'page', route: 'cgma-ai-education-survey', marker: 'const questions = [' },
  { path: '/cgma/ai-education/api/stats', kind: 'private', route: 'cgma-ai-education-api' },
]);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const transient = new Set([429, 500, 502, 504]);

export async function checkEndpoint(target, { fetchFn = fetch, sleep = pause, origin = ORIGIN, attempts = 3 } = {}) {
  let lastReason = 'unknown';
  const url = new URL(target.path, origin).toString();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchFn(url, { method: 'GET', headers: HEADERS, redirect: 'manual', signal: AbortSignal.timeout(15000) });
      const status = response.status;
      const route = String(response.headers.get('x-ekodi-route') || '');
      // The retired guard answering means the gateway did not own the path: never retry it away.
      if (route === GUARD_ROUTE) return { path: target.path, ok: false, status, reason: 'gateway_bypass' };
      if (transient.has(status) || (status === 503 && attempt < attempts)) {
        lastReason = 'http_' + status;
      } else if (target.kind === 'private') {
        // Statistics are tenant-admin only. Never inspect or print the body beyond status and route.
        const ok = status === 401 && route === target.route;
        return { path: target.path, ok, status, reason: ok ? 'admin_only' : (status === 200 ? 'private_statistics_exposed' : 'unexpected_boundary') };
      } else if (status !== 200) {
        return { path: target.path, ok: false, status, reason: 'unexpected_http_status' };
      } else {
        const body = (await response.text()).slice(0, 200000);
        if (route !== target.route) return { path: target.path, ok: false, status, reason: 'unexpected_route_owner' };
        const ok = body.includes(target.marker);
        return { path: target.path, ok, status, reason: ok ? 'operating_survey_verified' : 'operating_survey_marker_missing' };
      }
    } catch (error) {
      lastReason = error?.name === 'TimeoutError' ? 'timeout' : 'network_or_parse_error';
    }
    if (attempt < attempts) await sleep(Math.min(8000, 1500 * 2 ** (attempt - 1)));
  }
  return { path: target.path, ok: false, status: null, reason: lastReason };
}

export async function checkCgmaAiEducation(options = {}) {
  const results = [];
  for (const target of TARGETS) {
    results.push(await checkEndpoint(target, options));
    if (target !== TARGETS.at(-1)) await (options.sleep || pause)(350);
  }
  return {
    schemaVersion: 1,
    service: 'cgma-ai-education-survey',
    sourceOfTruth: 'topmaster-joseph/cheonggye-market',
    ok: results.every(r => r.ok),
    gatewayBypass: results.some(r => r.reason === 'gateway_bypass'),
    results,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkCgmaAiEducation();
  const summary = result.results.map(r => (r.ok ? 'PASS' : 'FAIL') + ' ' + r.path + ' ' + r.reason).join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## CGMA AI education survey health\n\n' + summary + '\n');
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
