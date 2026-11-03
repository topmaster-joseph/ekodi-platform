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
  for (const marker of ['/health', '/feed.xml', '/api/posts', 'https://ekodi.kr/admin/journal']) {
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

test('journal public links and data requests stay under the canonical /journal path', () => {
  const html = read('journal/index.html');
  const app = read('journal/app.js');
  const worker = read('journal-worker.js');
  const expectedHtml = [
    'href="/journal/feed.xml"', 'href="/journal/styles.css?v=',
    'src="/journal/app.js?v=', 'href="/journal/" class="journal-back"',
  ];
  for (const expected of expectedHtml) assert.ok(html.includes(expected), `missing ${expected}`);
  assert.match(app, /fetch\('\/journal\/api\/posts'\)/);
  assert.match(app, /fetch\(\`\/journal\/api\/posts\//);
  assert.match(app, /href="\/journal\/p\//);
  assert.match(app, /location\.pathname\.match\(\/\^\\\/journal/);
  assert.match(app, /history\.pushState\(\{\}, '', '\/journal\/'\)/);
  assert.match(worker, /https:\/\/ekodi\.kr\/admin\/journal/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:app\.js|styles\.css|feed\.xml)"/);
  assert.doesNotMatch(app, /fetch\(['"\`]\/api\/posts/);
});
