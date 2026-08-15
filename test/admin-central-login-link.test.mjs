import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('control center ships a direct central-admin link before JavaScript runs', async () => {
  const html = await read('control-center.html');
  assert.match(html, /id="centralAdminLogin"/);
  assert.match(html, /href="https:\/\/auth\.ekodi\.kr\/\?site=admin&amp;return_to=https%3A%2F%2Fadmin\.ekodi\.kr%2F"/);
  assert.match(html, /<form id="loginForm" hidden>/);
  assert.match(html, /<script src="admin-central-handoff\.js"><\/script>[\s\S]*<script src="control-center\.js"><\/script>/);
});

test('shared edge preserves the direct auth anchor instead of rewriting it as a form submit', async () => {
  const worker = await read('site-worker.js');
  assert.doesNotMatch(worker, /function adminLoginFormHtml\(/);
  assert.doesNotMatch(worker, /function rewriteAdminLogin\(/);
  assert.doesNotMatch(worker, /new HTMLRewriter\(\)/);
  assert.doesNotMatch(worker, /centralAdminLoginForm/);
  assert.match(worker, /if \(ADMIN_ALIASES\.has\(url\.pathname\)\) \{[\s\S]*?return withHostSecurity\(response, ADMIN_CSP, 'no-store', 'admin-control-center'\);/);
  assert.match(worker, /"form-action 'self'"/);
});

test('legacy admin auth start remains a fixed-origin allow-listed fallback', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /url\.pathname === '\/auth\/start'/);
  assert.match(worker, /return ADMIN_ALIASES\.has\(candidate\) \? candidate : '\/'/);
  assert.match(worker, /new URL\('https:\/\/auth\.ekodi\.kr\/'\)/);
  assert.match(worker, /target\.searchParams\.set\('site', 'admin'\)/);
  assert.match(worker, /target\.searchParams\.set\('return_to', `https:\/\/admin\.ekodi\.kr\$\{safePath\}`\)/);
  assert.match(worker, /'X-EKODI-Route': 'admin-auth-start'/);
});

test('central handoff keeps a direct auth link fallback and does not inject duplicates', async () => {
  const source = await read('admin-central-handoff.js');
  assert.match(source, /!document\.querySelector\('#centralAdminLogin'\)/);
  assert.match(source, /link\.href='https:\/\/auth\.ekodi\.kr\/\?site=admin&return_to=https%3A%2F%2Fadmin\.ekodi\.kr%2F'/);
  assert.match(source, /form\.hidden=true/);
});
