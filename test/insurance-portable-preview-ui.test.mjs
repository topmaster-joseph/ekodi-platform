import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('migration preview stays outside public assets, canonical router and production page', async () => {
  const [preview, html, route, build] = await Promise.all([
    read('sites/ekodi-insurance/preview/portable.html'),
    read('sites/ekodi-insurance/public/index.html'),
    read('insurance-public-route.js'),
    read('scripts/build.mjs')
  ]);
  assert.match(preview, /Security review candidate/);
  assert.doesNotMatch(html, /portable\.html|portable\.js|portable-records/);
  assert.doesNotMatch(route, /portable\.html|portable\.js|portable-records/);
  assert.doesNotMatch(build, /preview\/portable/);
  assert.match(preview, /connect-src 'none'/);
  assert.match(preview, /script-src 'self'/);
});

test('preview requires direct user actions and separate sensitive data choices', async () => {
  const [html, script] = await Promise.all([
    read('sites/ekodi-insurance/preview/portable.html'),
    read('sites/ekodi-insurance/preview/portable.js')
  ]);
  for (const marker of [
    'include-diagnosis', 'include-chat', 'import-diagnosis', 'import-chat',
    'backup-ack', 'import-consent', 'confirm-import', 'undo-import'
  ]) assert.ok(html.includes('id="' + marker + '"'), marker + ' control missing');
  for (const marker of [
    "addEventListener('submit'", "addEventListener('click'",
    'encryptPortableRecords', 'planPortableImport', 'commitPortableImport',
    'rollbackPortableImport', 'includeDiagnosis', 'includeChat'
  ]) assert.ok(script.includes(marker), marker + ' interaction missing');
  assert.match(html, /<button id="confirm-import" type="button" disabled>/);
  assert.match(html, /<button id="undo-import" type="button" disabled>/);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|postMessage\s*\(/);
  assert.doesNotMatch(script, /console\.log|console\.error/);
});
