import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const js = await readFile(new URL('../homepage-ambient.js', import.meta.url), 'utf8');
const forwarder = js.slice(0, js.indexOf('})();') + 5);

function run(pathname, hash) {
  const calls = [];
  const location = { pathname, hash, replace: url => calls.push(url) };
  vm.runInNewContext(forwarder, { location });
  return calls;
}

test('a login token landing on the homepage continues to My Page with the fragment intact', () => {
  assert.deepEqual(run('/', '#ekodi_token=abc123&ekodi_type=email'), ['/my/#ekodi_token=abc123&ekodi_type=email']);
  assert.deepEqual(run('/index.html', '#ekodi_type=email&ekodi_token=x'), ['/my/#ekodi_type=email&ekodi_token=x']);
});

test('ordinary homepage visits and other pages are untouched', () => {
  assert.deepEqual(run('/', ''), []);
  assert.deepEqual(run('/', '#services'), []);
  assert.deepEqual(run('/', '#not_ekodi_token=1'), []);
  assert.deepEqual(run('/cgma/', '#ekodi_token=abc'), []);
});

test('the forwarder runs first and the portal login defaults to My Page', async () => {
  assert.match(js, /^\/\/ Login returns that land on the homepage/);
  const auth = await readFile(new URL('../auth-site/auth.js', import.meta.url), 'utf8');
  assert.match(auth, /portal:\{name:'EKODI',tenant:null,role:'member',returnTo:'https:\/\/ekodi\.kr\/my\/'/);
});
