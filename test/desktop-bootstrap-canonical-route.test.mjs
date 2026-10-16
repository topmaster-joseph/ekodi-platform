import test from 'node:test';
import assert from 'node:assert/strict';
import siteWorker from '../site-worker.js';

test('Desktop Bootstrap entry aliases redirect before the generic admin shell fallback', async () => {
  for (const pathname of ['/admin/desktop/bootstrap', '/admin/desktop/bootstrap/', '/admin/desktop/bootstrap/index.html']) {
    const response = await siteWorker.fetch(new Request(`https://ekodi.kr${pathname}`), {}, {});
    assert.equal(response.status, 307, pathname);
    assert.equal(response.headers.get('location'), '/admin/status/devices', pathname);
    assert.equal(response.headers.get('cache-control'), 'no-store', pathname);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive', pathname);
    assert.equal(response.headers.get('x-ekodi-route'), 'desktop-bootstrap-canonical', pathname);
  }
});

test('Desktop Bootstrap entry never accepts mutations or forwards untrusted query parameters', async () => {
  const response = await siteWorker.fetch(new Request('https://ekodi.kr/admin/desktop/bootstrap/?some-param=secret'), {}, {});
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), '/admin/status/devices');
  const rejected = await siteWorker.fetch(new Request('https://ekodi.kr/admin/desktop/bootstrap/', {method:'POST'}), {}, {});
  assert.equal(rejected.status, 405);
  assert.equal(rejected.headers.get('allow'), 'GET, HEAD');
});
