import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('control center ships a native central-admin login link before JavaScript runs', async () => {
  const html = await read('control-center.html');
  assert.match(html, /<a id="centralAdminLogin" class="primary full" href="https:\/\/auth\.ekodi\.kr\/\?site=admin&amp;return_to=https%3A%2F%2Fadmin\.ekodi\.kr%2F">/);
  assert.match(html, /<form id="loginForm" hidden>/);
  assert.match(html, /<script src="admin-central-handoff\.js"><\/script>[\s\S]*<script src="control-center\.js"><\/script>/);
});

test('central handoff keeps the native link instead of duplicating it', async () => {
  const source = await read('admin-central-handoff.js');
  assert.match(source, /!document\.querySelector\('#centralAdminLogin'\)/);
  assert.match(source, /form\.hidden=true/);
});
