import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASELINE_RATIONALE,
  DESIRED_EDGE_BASELINE,
  validateDesiredBaseline,
} from '../scripts/enforce-cloudflare-edge-baseline.mjs';

test('Cloudflare edge baseline keeps the low-risk HTTPS/TLS/transport contract', () => {
  assert.deepEqual(validateDesiredBaseline(), []);
  assert.equal(DESIRED_EDGE_BASELINE.always_use_https, 'on');
  assert.equal(DESIRED_EDGE_BASELINE.automatic_https_rewrites, 'on');
  assert.equal(DESIRED_EDGE_BASELINE.min_tls_version, '1.2');
  assert.equal(DESIRED_EDGE_BASELINE.tls_1_3, 'on');
  assert.equal(DESIRED_EDGE_BASELINE.http2, 'on');
  assert.equal(DESIRED_EDGE_BASELINE.brotli, 'on');
});

test('HTTP3 stays off until the existing Admin HTTP2 stability exception is retired', () => {
  assert.equal(DESIRED_EDGE_BASELINE.http3, 'off');
  assert.match(BASELINE_RATIONALE.http3, /Admin HTTP2 stability/i);
});

test('validator rejects weakening the transport baseline', () => {
  const errors = validateDesiredBaseline({
    ...DESIRED_EDGE_BASELINE,
    always_use_https: 'off',
    min_tls_version: '1.0',
    http3: 'on',
  });
  assert.ok(errors.some(message => /HTTPS/.test(message)));
  assert.ok(errors.some(message => /TLS/.test(message)));
  assert.ok(errors.some(message => /HTTP\/3/.test(message)));
});
