import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('Journal HTML versions application code and styles together to escape stale immutable asset caches', () => {
  const html = read('journal/index.html');
  const jsVersion = html.match(/src="\/journal\/app\.js\?v=([a-z0-9-]+)"/)?.[1];
  const cssVersion = html.match(/href="\/journal\/styles\.css\?v=([a-z0-9-]+)"/)?.[1];
  assert.ok(jsVersion, 'Journal app.js must have a versioned URL');
  assert.ok(cssVersion, 'Journal styles.css must have a versioned URL');
  assert.equal(jsVersion, cssVersion, 'JS and CSS should share a release version');
  assert.doesNotMatch(html, /src="\/journal\/app\.js"/);
  assert.doesNotMatch(html, /href="\/journal\/styles\.css"/);
});

test('Journal JS and CSS must revalidate instead of remaining immutable for 24 hours', () => {
  const worker = read('journal-worker.js');
  assert.match(worker, /isCodeAsset = \/\\\.\(\?:js\|css\)\$\/.test\(path\)/);
  assert.match(worker, /public, max-age=60, must-revalidate/);
  assert.match(worker, /isCodeAsset/);
  assert.match(worker, /public, max-age=86400, immutable/);
});
