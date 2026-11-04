import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const [auth, router, ui] = await Promise.all([
  read('../auth-site/client-auth.js'),
  read('../auth-site/auth-router.js'),
  read('../cooperative-ui.js'),
]);

// Extract client-auth's safeReturn and evaluate it against the coop realm.
function safeReturnFor(site) {
  const start = auth.indexOf('function safeReturn(raw){');
  const end = auth.indexOf('\nconst RETURN_TO=', start);
  assert.ok(start >= 0 && end > start, 'safeReturn exists');
  const realmsStart = auth.indexOf('const realms={');
  const realmsEnd = auth.indexOf('\n};', realmsStart) + 3;
  const realms = new Function(auth.slice(realmsStart, realmsEnd) + '\nreturn realms;')();
  const config = realms[site];
  assert.ok(config, `realm ${site} registered`);
  return new Function('config', 'DIRECT_LOGIN', auth.slice(start, end) + '\nreturn safeReturn;')(config, true);
}

test('cooperative pages request the dedicated coop login realm', () => {
  assert.match(ui, /url\.searchParams\.set\('site', 'coop'\)/);
  assert.doesNotMatch(ui, /url\.searchParams\.set\('site', 'portal'\)/);
  assert.match(router, /firstPartyClientSites=new Set\(\[[^\]]*'coop'/);
});

test('admin and member logins return to the cooperative page they started from', () => {
  const safeReturn = safeReturnFor('coop');
  for (const url of [
    'https://ekodi.kr/jubilee/admin',
    'https://ekodi.kr/jubilee/members',
    'https://ekodi.kr/open/admin',
    'https://ekodi.kr/open/members',
    'https://ekodi.kr/business-coop/',
    'https://ekodi.kr/jubilee-distribution/admin',
  ]) assert.equal(safeReturn(url), url, url);
  assert.equal(safeReturn('https://ekodi.kr/open/admin#ekodi_token=x'), 'https://ekodi.kr/open/admin');
});

test('coop realm never becomes an open redirect', () => {
  const safeReturn = safeReturnFor('coop');
  const fallback = 'https://ekodi.kr/business-coop/';
  for (const url of [
    'https://evil.example/jubilee/admin',
    'https://ekodi.kr/admin/',
    'https://ekodi.kr/jubileefake/admin',
    'https://ekodi.kr/openx',
    'http://ekodi.kr/jubilee/admin',
    'https://user:pw@ekodi.kr/jubilee/admin',
    'javascript:alert(1)',
  ]) assert.equal(safeReturn(url), fallback, url);
});
