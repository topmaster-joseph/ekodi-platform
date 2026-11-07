import test from 'node:test';
import assert from 'node:assert/strict';
import insuranceApi from '../sites/ekodi-insurance/api/worker.js';

const ORIGIN = 'https://ekodi.kr';
const INTERNAL_BASE = 'https://insurance.internal.invalid';

function req(path, method, origin=ORIGIN) {
  return new Request(INTERNAL_BASE + path, {
    method, headers: {
      origin,
      ...(method === 'OPTIONS' ? {
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type'
      } : {})
    }
  });
}
const safeEnv = {
  ENVIRONMENT: 'production',
  DB: null, // prove negative paths never query production D1
  INSURANCE_COMPARISON_PUBLIC_ENABLED: 'false'
};

test('effective old-only allowlist rejects canonical apex on preflight without issuing a D1 query', async () => {
  const env = { ...safeEnv, ALLOWED_ORIGINS: 'https://legacy.example' };
  const response = await insuranceApi.fetch(req('/api/consultations', 'OPTIONS'), env);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal((await response.json()).error, '허용되지 않은 요청입니다.');
});

test('independent apex configuration can accept preflight without broad CORS or D1 access', async () => {
  const env = { ...safeEnv, ALLOWED_ORIGINS: ORIGIN };
  const response = await insuranceApi.fetch(req('/api/consultations', 'OPTIONS'), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(response.headers.get('vary'), 'Origin');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const foreign = await insuranceApi.fetch(req('/api/consultations', 'OPTIONS', 'https://untrusted.invalid'), env);
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
});

test('a valid apex Origin never bypasses backend D1 readiness or private admin controls', async () => {
  const env = { ...safeEnv, ALLOWED_ORIGINS: ORIGIN };
  const response = await insuranceApi.fetch(req('/api/internal/consultations', 'GET'), env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).error, 'Insurance D1 데이터베이스 연결이 없습니다.');
});


test('candidate production config preserves both exact insurance origins without wildcard', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = new URL('../sites/ekodi-insurance/api/wrangler.toml', import.meta.url);
  const config = await readFile(path, 'utf8');
  const declaration = /^ALLOWED_ORIGINS\s*=\s*"([^"]+)"\s*$/m.exec(config);
  assert.ok(declaration, 'explicit production Origin allowlist must be configured');
  const allowed = declaration[1].split(',').map(s => s.trim());
  assert.equal(new Set(allowed).size, 2);
  assert.ok(allowed.includes(ORIGIN), 'canonical apex origin must be explicitly allowed');
  assert.ok(allowed.every(s => /^https:\/\/[a-z0-9.-]+$/.test(s)), 'no wildcard, path or scheme downgrades');
  assert.ok(!allowed.includes('*'));
  const historical = allowed.find(s => s !== ORIGIN);
  assert.ok(historical, 'historic browser origin must not be retired prematurely');
  const env = { ...safeEnv, ALLOWED_ORIGINS: declaration[1] };
  for (const origin of [ORIGIN, historical]) {
    const response = await insuranceApi.fetch(req('/api/consultations', 'OPTIONS', origin), env);
    assert.equal(response.status, 204, 'known origin preflight must be allowed');
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  const foreign = await insuranceApi.fetch(req('/api/consultations', 'OPTIONS', 'https://untrusted.invalid'), env);
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
});
