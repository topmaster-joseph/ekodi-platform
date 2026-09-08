import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin critical shell stays interactive without eager operational modules', async () => {
  const source = await read('admin-authenticated-shell.js');
  assert.match(source, /criticalPostAuthScripts/);
  assert.match(source, /'admin-demand-loader\.js'/);
  assert.match(source, /for\(const src of criticalPostAuthScripts\)[\s\S]*?await loadScript\(src\)/);
  for (const heavy of ['ai-ops-admin.js', 'admin-lazy-features.js', 'release-control-admin.js', 'work-admin.js', 'marketing-ai-admin.js']) {
    assert.doesNotMatch(source, new RegExp(`'${heavy.replaceAll('.', '\\.')}'`));
  }
  assert.match(source, /deferredPostAuthScripts/);
  assert.match(source, /Promise\.allSettled\(deferredPostAuthScripts\.map\(loadScript\)\)/);
  assert.match(source, /requestAnimationFrame/);
});

test('retired Operations grid is absent from the current Admin shell', async () => {
  const html = await read('admin-shell.html');
  assert.doesNotMatch(html, /control-center\.js|control-center-features\.js/);
  await assert.rejects(read('control-center.js'), error => error?.code === 'ENOENT');
  await assert.rejects(read('control-center-features.js'), error => error?.code === 'ENOENT');
});

test('Finance monitor is demand-loaded after authentication', async () => {
  const html = await read('admin-shell.html');
  const loader = await read('admin-demand-loader.js');
  assert.doesNotMatch(html, /<script src="finance-monitor\.js"><\/script>/);
  assert.match(loader, /finance\.addEventListener\('click'/);
  assert.match(loader, /loadStyle\('admin-finance\.css'\)\.then\(\(\) => loadScript\('finance-monitor\.js'\)\)/);
});
