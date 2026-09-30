import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const workflow = await readFile(`${root}.github/workflows/deploy.yml`, 'utf8');
const authPage = await readFile(`${root}auth-site/index.html`, 'utf8');

test('full ecosystem auth smoke marker matches the current auth page contract', () => {
  assert.match(authPage, /<title>EKODI 로그인<\/title>/);
  assert.match(workflow, /verify_html 'https:\/\/auth\.ekodi\.kr\/' 'EKODI 로그인'/);
});
