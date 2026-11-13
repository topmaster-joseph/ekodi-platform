// EKODI AI purchase-agency: production read-only/negative-authorization canary.
// Never submit applications, charges, quotes, cancellations or private credentials.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const ROUTES = Object.freeze(['apply', 'university', 'individual', 'manage']);
const PREFIX = '/ekodibiz/ai-agency';
const API = '/ekodibiz/api/agency';
const FAKE_ID = `EBAI-${'Z'.repeat(24)}`;

export async function verifyAgencyLive({
  fetchImpl = fetch,
  origin = 'https://ekodi.kr',
  expectedRealPaymentsEnabled = false,
} = {}) {
  // Disallow pointing this verification at another origin: this is an operator-owned canonical probe.
  const url = new URL(origin);
  assert.equal(url.origin, 'https://ekodi.kr', 'Production canary must use canonical HTTPS owner');
  assert.equal(url.pathname, '/', 'Origin must not contain a path');
  const call = async (path, init = {}) => {
    const r = await fetchImpl(url.origin + path, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/json, text/html, application/javascript', ...(init.headers || {}) },
      ...init,
    });
    assert.ok(r instanceof Response || (r && typeof r.status === 'number'), 'HTTP Response required');
    return r;
  };

  const h = await call(`${API}/health`);
  assert.equal(h.status, 200, 'Agency health must respond HTTP 200');
  const health = await h.json();
  assert.equal(health.ok, true);
  assert.equal(health.service, 'ai-purchase-agency');
  assert.equal(health.maxMonths, 120);
  assert.equal(health.realPaymentsEnabled, expectedRealPaymentsEnabled,
    'Unexpected real-money readiness change; requires independent PG/legal approval before opening checkout');

  const pages = [];
  for (const route of ROUTES) {
    const p = await call(`${PREFIX}/${route}`);
    assert.equal(p.status, 200, `Canonical agency page ${route} must be HTTP 200`);
    assert.match(p.headers.get('content-type') || '', /text\/html/i);
    const html = await p.text();
    assert.match(html, /AI|위탁/i, `${route} must contain the agency application`);
    for (const name of ROUTES) {
      assert.ok(html.includes(`${PREFIX}/${name}`), `${route} missing canonical ${name} navigation`);
    }
    if (route === 'manage') {
      assert.match(html, /id=["']findId["']/, 'Manager must expose exact-ID old-contract lookup');
      assert.match(html, /id=["']findBtn["']/, 'Manager must expose lookup action');
    }
    pages.push(route);
  }
  const script = await call('/ekodibiz/ai-agency-links.js');
  assert.equal(script.status, 200, 'Shared canonical route JS must be served');
  assert.match(script.headers.get('content-type') || '', /javascript|ecmascript/i);
  const js = await script.text();
  for (const route of ROUTES) assert.ok(js.includes(`'/${route}'`), `Shared route JS lacks ${route}`);

  // These POST calls are *negative* authorization tests with no administrator key.
  // The fake ID has never been issued and must not be accepted or revealed.
  const denied = [];
  for (const [path, body] of [
    ['/admin/readiness', {}],
    ['/admin/list', {}],
    ['/admin/find', { id: FAKE_ID }],
    ['/admin/settlement', { id: FAKE_ID }],
  ]) {
    const response = await call(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 403, `Anonymous admin API ${path} must deny access`);
    const data = await response.json();
    assert.deepEqual(data, { ok: false, error: 'admin_access_denied' },
      `Anonymous admin ${path} must not disclose records`);
    denied.push(path);
  }
  const unknown = await call(`${API}/status`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({id: FAKE_ID, receiptToken: 'synthetic-non-issued-secret'}),
  });
  assert.equal(unknown.status, 404, 'Synthetic customer receipt must not disclose any contract');
  const notFound = await unknown.json();
  assert.equal(notFound.ok, false);
  assert.ok(['not_found','invalid_receipt'].includes(notFound.error));

  return {ok: true, pages, anonymousAdminDenied:denied,
    syntheticReceiptDenied: true, realPaymentsEnabled:health.realPaymentsEnabled};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyAgencyLive().then(result => {
    process.stdout.write(JSON.stringify(result) + '\n');
  }).catch(error => {
    process.stderr.write(`EKODIBIZ agency read-only canary FAILED: ${error.message}\n`);
    process.exitCode = 1;
  });
}
