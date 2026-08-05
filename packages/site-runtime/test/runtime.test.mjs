import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/SiteApp.tsx', import.meta.url), 'utf8');

test('private applications validate a shared server session before rendering', () => {
  assert.match(source, /config\.access === 'private'/);
  assert.match(source, /fetch\(`\$\{API\}\/api\/session`/);
  assert.match(source, /authorization: `Bearer \$\{sessionToken\}`/);
  assert.match(source, /type="password"/);
});

test('published CMS content is rendered as React text content', () => {
  assert.match(source, /\{selected\.content\}/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test('runtime exposes Korean accessible navigation and error states', () => {
  assert.match(source, /본문 바로가기/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="alert"/);
});
