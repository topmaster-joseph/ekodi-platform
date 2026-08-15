import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('control center still ships a native central-admin fallback before JavaScript runs', async () => {
  const html = await read('control-center.html');
  assert.match(html, /id="centralAdminLogin"/);
  assert.match(html, /https:\/\/auth\.ekodi\.kr\/\?site=admin/);
  assert.match(html, /<form id="loginForm" hidden>/);
  assert.match(html, /<script src="admin-central-handoff\.js"><\/script>[\s\S]*<script src="control-center\.js"><\/script>/);
});

test('shared edge replaces the admin CTA with a same-origin native form', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /function adminLoginFormHtml\(returnPath\)/);
  assert.match(worker, /id=\"centralAdminLoginForm\" action=\"\/auth\/start\" method=\"get\"/);
  assert.match(worker, /id=\"centralAdminLogin\" class=\"primary full\" type=\"submit\"/);
  assert.match(worker, /new HTMLRewriter\(\)/);
  assert.match(worker, /element\.replace\(adminLoginFormHtml\(returnPath\), \{ html: true \}\)/);
});

test('admin auth start is a fixed-origin allow-listed redirect and preserves Work return path', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /url\.pathname === '\/auth\/start'/);
  assert.match(worker, /return ADMIN_ALIASES\.has\(candidate\) \? candidate : '\/'/);
  assert.match(worker, /new URL\('https:\/\/auth\.ekodi\.kr\/'\)/);
  assert.match(worker, /target\.searchParams\.set\('site', 'admin'\)/);
  assert.match(worker, /target\.searchParams\.set\('return_to', `https:\/\/admin\.ekodi\.kr\$\{safePath\}`\)/);
  assert.match(worker, /'X-EKODI-Route': 'admin-auth-start'/);
});

test('central handoff sees the rewritten button id and does not inject a duplicate CTA', async () => {
  const source = await read('admin-central-handoff.js');
  assert.match(source, /!document\.querySelector\('#centralAdminLogin'\)/);
  assert.match(source, /form\.hidden=true/);
});
