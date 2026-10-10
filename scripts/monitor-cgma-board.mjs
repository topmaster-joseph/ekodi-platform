import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ORIGIN = 'https://ekodi.kr';
const HEADERS = Object.freeze({ accept: 'text/html,application/json', 'cache-control': 'no-cache', 'user-agent': 'EKODI-CGMA-board-health/1.0' });
const TARGETS = Object.freeze([
  { path: '/cgma/board', kind: 'html' },
  { path: '/cgma/board/api/health', kind: 'health' },
  { path: '/cgma/board/api/posts', kind: 'posts' },
  { path: '/cgma/board/api/memberships', kind: 'private' },
]);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const transient = new Set([429, 500, 502, 503, 504]);

export async function checkEndpoint(target, { fetchFn = fetch, sleep = pause, origin = ORIGIN, attempts = 3 } = {}) {
  let lastReason = 'unknown';
  const url = new URL(target.path, origin).toString();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchFn(url, { method: 'GET', headers: HEADERS, redirect: 'manual', signal: AbortSignal.timeout(15000) });
      const status = response.status;
      if (transient.has(status)) {
        lastReason = 'http_' + status;
      } else if (target.kind === 'private') {
        // Never fetch, inspect, or print private body content, even if access accidentally succeeds.
        return { path: target.path, ok: [401, 403].includes(status), status, reason: [401, 403].includes(status) ? 'access_denied' : 'private_endpoint_exposed_or_unexpected_status' };
      } else if (status !== 200) {
        return { path: target.path, ok: false, status, reason: 'unexpected_http_status' };
      } else if (target.kind === 'html') {
        const body = (await response.text()).slice(0, 120000);
        const ok = /<title[^>]*>\s*게시판\s*<\/title>/i.test(body) && body.includes('게시판');
        return { path: target.path, ok, status, reason: ok ? 'board_rendered' : 'board_html_invalid' };
      } else {
        const body = await response.json();
        const id = body?.boardId === 'site:cgma:main';
        const headerId = response.headers.get('x-ekodi-board-id');
        const independent = response.headers.get('x-ekodi-board-independent');
        const headerOk = headerId === 'site:cgma:main' && independent === 'true';
        const ok = target.kind === 'health'
          ? body?.ok === true && body?.siteId === 'cgma' && body?.independent === true && id && headerOk
          : Array.isArray(body?.items) && id && headerOk;
        return { path: target.path, ok, status, reason: ok ? 'identity_verified' : 'board_identity_or_payload_invalid' };
      }
    } catch (error) {
      // Do not echo request headers, tokens, private response bodies or arbitrary exception text.
      lastReason = error?.name === 'TimeoutError' ? 'timeout' : 'network_or_parse_error';
    }
    if (attempt < attempts) await sleep(Math.min(8000, 1500 * 2 ** (attempt - 1)));
  }
  return { path: target.path, ok: false, status: null, reason: lastReason };
}

export async function checkCgmaBoard(options = {}) {
  const results = [];
  for (const target of TARGETS) {
    results.push(await checkEndpoint(target, options));
    if (target !== TARGETS.at(-1) && options.sleep) await options.sleep(350);
    else if (target !== TARGETS.at(-1)) await pause(350);
  }
  return { schemaVersion: 1, service: 'cgma-independent-board', ok: results.every(r => r.ok), results };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkCgmaBoard();
  const summary = result.results.map(r => (r.ok ? 'PASS' : 'FAIL') + ' ' + r.path + ' ' + r.reason).join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## CGMA board health\n\n' + summary + '\n');
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
