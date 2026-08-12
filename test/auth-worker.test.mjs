import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { isAllowedOrigin, secureEqual, validateDnsRecord } from '../auth-worker.js';

test('production CORS only accepts configured origins', () => {
  const env = { ENVIRONMENT: 'production', ALLOWED_ORIGINS: 'https://console.ekodi.example, https://backup.ekodi.example' };
  assert.equal(isAllowedOrigin('https://console.ekodi.example', env), true);
  assert.equal(isAllowedOrigin('https://attacker.example', env), false);
  assert.equal(isAllowedOrigin('http://localhost:3000', env), false);
  assert.equal(isAllowedOrigin(null, env), true);
});

test('constant-time comparison reports equality', () => {
  assert.equal(secureEqual('abc123', 'abc123'), true);
  assert.equal(secureEqual('abc123', 'abc124'), false);
  assert.equal(secureEqual('short', 'longer'), false);
});

test('DNS validation normalizes supported records', () => {
  assert.deepEqual(validateDnsRecord({
    type: 'cname',
    name: 'WWW.EKODI.KR',
    content: 'target.example.com',
    ttl: 300,
    proxied: true
  }), {
    value: {
      type: 'CNAME',
      name: 'www.ekodi.kr',
      content: 'target.example.com',
      ttl: 300,
      proxied: true
    }
  });
});

test('DNS validation rejects unsupported and unsafe records', () => {
  assert.match(validateDnsRecord({ type: 'CAA', name: '@', content: 'value' }).error, /지원하지/);
  assert.match(validateDnsRecord({ type: 'A', name: '<script>', content: '127.0.0.1' }).error, /호스트/);
  assert.match(validateDnsRecord({ type: 'A', name: '@', content: '127.0.0.1', ttl: 10 }).error, /TTL/);
});

test('health endpoint works without database credentials', async () => {
  const response = await worker.fetch(new Request('https://api.example/health', {
    headers: { origin: 'https://console.ekodi.example' }
  }), {
    ENVIRONMENT: 'production',
    ALLOWED_ORIGINS: 'https://console.ekodi.example'
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'ekodi-auth-api', version: 4 });
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://console.ekodi.example');
});

test('disallowed origins fail closed without a CORS grant', async () => {
  const response = await worker.fetch(new Request('https://api.example/health', {
    headers: { origin: 'https://attacker.example' }
  }), {
    ENVIRONMENT: 'production',
    ALLOWED_ORIGINS: 'https://console.ekodi.example'
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
