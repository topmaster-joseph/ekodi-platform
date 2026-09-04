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
  assert.ok(shell.includes("document.body.classList.add('ekodi-admin-shell-v2')"));
  assert.ok(shell.includes("sideBottom.insertBefore(profile, logoutButton || null)"));
  assert.ok(shell.includes('pageTitle.parentElement.hidden = true'));
  assert.ok(shell.includes("matchMedia('(max-width:760px)').matches ? 'flex' : 'none'"));
});

test('sidebar menu and workspace have independent vertical scrolling', () => {
  assert.ok(shell.includes("nav.style.setProperty('overflow-y', 'auto', 'important')"));
  assert.ok(shell.includes("nav.style.setProperty('flex', '1 1 auto', 'important')"));
  assert.ok(shell.includes("main.style.setProperty('overflow-y', 'auto')"));
  assert.ok(shell.includes("sideBottom.style.setProperty('position', 'static', 'important')"));
  assert.ok(shell.includes("nav.dataset.ekodiIndependentScroll = 'true'"));
  assert.ok(shell.includes("content.dataset.ekodiIndependentScroll = 'workspace'"));
});
