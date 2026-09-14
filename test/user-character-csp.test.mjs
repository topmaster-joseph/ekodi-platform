import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared user surfaces load EKODIAN presentation from an external CSP-safe stylesheet', async () => {
  const [injector, css, localCommerceWorker] = await Promise.all([
    read('ekodi-shell-injector.js'),
    read('shell/user-character.css'),
    read('local-commerce-worker.js'),
  ]);

  assert.match(injector, /SHELL_CHARACTER_STYLE=.*user-character\.css/);
  assert.match(injector, /data-ekodi-user-character-style="v1"/);
  assert.match(css, /\.ekodi-main-ekodian\{/);
  assert.match(css, /max-width:176px!important/);
  assert.match(css, /\.ekodi-main-ekodian svg\{[^}]*width:100%!important/);
  assert.match(css, /data-ekodi-character-placement="hidden"/);

  // Local Commerce deliberately keeps inline styles disallowed. The Character Engine
  // must therefore remain correct without weakening the service CSP.
  assert.match(localCommerceWorker, /style-src 'self'/);
  assert.doesNotMatch(localCommerceWorker, /style-src[^;]*'unsafe-inline'/);
});
