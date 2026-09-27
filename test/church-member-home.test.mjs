import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../platform-router-entry-worker.js';
import { churchMemberHomePage, isChurchMemberHomePath } from '../church-member-home-page.js';

test('shared site owns only the no-slash church member canonical entry', async () => {
  assert.equal(isChurchMemberHomePath('/ekodichurch/my'), true);
  assert.equal(isChurchMemberHomePath('/ekodichurch/my/'), false);
  assert.equal(isChurchMemberHomePath('/ekodichurch/my/giving/'), false);
  assert.equal(isChurchMemberHomePath('/ekodichurch/my/attendance/'), false);
  assert.equal(isChurchMemberHomePath('/ekodichurch/admin'), false);

  const response=churchMemberHomePage(new Request('https://ekodi.kr/ekodichurch/my?from=header'));
  assert.equal(response.status,308);
  assert.equal(response.headers.get('location'),'https://ekodi.kr/ekodichurch/my/?from=header');
  assert.equal(response.headers.get('x-ekodi-route'),'church-member-canonical-redirect');
  assert.equal(response.headers.get('x-ekodi-authority-scope'),'user');
  assert.match(response.headers.get('x-robots-tag')||'',/noindex/i);
  assert.match(response.headers.get('cache-control')||'',/no-store/);
});

test('apex router canonicalizes the no-slash church member entry before public routing', async () => {
  const response=await router.fetch(new Request('https://ekodi.kr/ekodichurch/my'),{},{waitUntil(){}});
  assert.equal(response.status,308);
  assert.equal(response.headers.get('location'),'https://ekodi.kr/ekodichurch/my/');
  assert.equal(response.headers.get('x-ekodi-route'),'church-member-canonical-redirect');
});

test('member canonical redirect routing precedes canonical public routing', async () => {
  const source=await (await import('node:fs/promises')).readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  const member=source.indexOf("isChurchMemberHomePath(url.pathname)");
  const canonical=source.indexOf("const canonical=await routeCanonicalSurface");
  assert.ok(member>=0&&canonical>member,'church member canonical redirect must route before canonical public redirect');
  assert.doesNotMatch(source,/churchMemberHomeCss/);
});
