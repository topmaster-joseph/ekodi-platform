import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePreviewRequest, isPreviewPath } from '../preview-page.js';

async function response(path, method = 'GET') {
  return handlePreviewRequest(new Request(`https://ekodi.kr${path}`, { method }));
}

test('preview hub redirects to platform and user is not a route', async () => {
  const hub = await response('/preview');
  assert.equal(hub.status, 308);
  assert.equal(hub.headers.get('location'), 'https://ekodi.kr/preview/platform');
  assert.equal(isPreviewPath('/preview/user'), false);
  assert.equal(await response('/preview/user'), null);
});

test('platform preview contains user journey inside the platform lens', async () => {
  const result = await response('/preview/platform');
  const html = await result.text();
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('x-ekodi-preview-mode'), 'platform');
  assert.match(html, /Platform Preview/);
  assert.match(html, /preview\/assets\/preview\.js/);
});
test('developer and EKODIBIZ previews use the common engine', async () => {
  const developer = await response('/preview/dev');
  assert.equal(developer.headers.get('x-ekodi-preview-mode'), 'dev');
  assert.match(await developer.text(), /Developer Preview/);

  const biz = await response('/ekodibiz/preview/platform');
  assert.equal(biz.headers.get('x-ekodi-preview-scope'), 'ekodibiz');
  assert.match(await biz.text(), /EKODIBIZ Platform Preview/);
});

test('preview assets carry strict browser security headers', async () => {
  const script = await response('/preview/assets/preview.js');
  assert.equal(script.status, 200);
  assert.equal(script.headers.get('x-frame-options'), 'DENY');
  assert.match(script.headers.get('content-security-policy') || '', /connect-src https:\/\/api\.ekodi\.kr/);
  assert.match(await script.text(), /api\/public\/preview\/map/);
});
