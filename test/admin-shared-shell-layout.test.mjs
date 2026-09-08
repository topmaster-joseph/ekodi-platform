import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [shell, worker, build] = await Promise.all([
  readFile(new URL('../admin-authenticated-shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../site-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
]);

test('all administrator hostnames inherit the same official admin shell', () => {
  for (const host of [
    'admin.ekodi.kr',
    'admin.biz.ekodi.kr',
    'admin.church.ekodi.kr',
    'admin.lab.ekodi.kr',
    'admin.trade.ekodi.kr',
  ]) {
    assert.ok(worker.includes(`'${host}'`), `${host} must stay in ADMIN_HOSTS`);
  }
  assert.ok(worker.includes("env.ASSETS.fetch(assetRequest(request, '/admin-shell'))"));
  assert.ok(build.includes('admin-authenticated-shell.js'));
});

test('shared shell removes the desktop title strip and moves account above logout', () => {
  assert.match(shell, /document\.body\.classList\.add\('ekodi-admin-shell-v2'\)/);
  assert.match(shell, /sideBottom\.insertBefore\(profile,\s*logoutButton\s*\|\|\s*null\)/);
  assert.match(shell, /pageTitle\.parentElement\.hidden\s*=\s*true/);
  assert.match(shell, /matchMedia\('\(max-width:760px\)'\)\.matches\s*\?\s*'flex'\s*:\s*'none'/);
});

test('workspace is the single vertical scroll owner and sidebar stays fixed', () => {
  assert.match(shell, /nav\.style\.setProperty\('overflow-y',\s*'hidden',\s*'important'\)/);
  assert.match(shell, /nav\.style\.setProperty\('flex',\s*'0 0 auto',\s*'important'\)/);
  assert.match(shell, /main\.style\.setProperty\('overflow-y',\s*'auto'\)/);
  assert.match(shell, /sideBottom\.style\.setProperty\('position',\s*'static',\s*'important'\)/);
  assert.match(shell, /nav\.dataset\.ekodiIndependentScroll\s*=\s*'false'/);
  assert.match(shell, /content\.dataset\.ekodiIndependentScroll\s*=\s*'false'/);
  assert.match(shell, /main\.dataset\.ekodiScrollOwner\s*=\s*'workspace'/);
  assert.doesNotMatch(shell, /nav\.style\.setProperty\('overflow-y',\s*'auto'/);
});
