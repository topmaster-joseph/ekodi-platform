import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('journal is an isolated registered service surface', () => {
  const boundary = JSON.parse(read('platform-boundaries.json'));
  const journal = boundary.platforms.journal;
  assert.equal(journal.kind, 'common-service-platform');
  assert.ok(journal.domains.includes('journal.ekodi.kr'));
  assert.equal(journal.deployWorkflow, '.github/workflows/deploy-journal.yml');
});

test('journal worker exposes health, feed, api and admin handoff', () => {
  const worker = read('journal-worker.js');
  for (const marker of ['/health', '/feed.xml', '/api/posts', 'https://admin.ekodi.kr/journal']) {
    assert.ok(worker.includes(marker), `missing ${marker}`);
  }
});

test('journal public UI follows shared shell and locale contract', () => {
  const html = read('journal/index.html');
  const app = read('journal/app.js');
  assert.match(html, /EKODI JOURNAL/);
  assert.match(app, /ekodi:locale-change/);
  assert.match(app, /EKODIUserLanguage/);
});
