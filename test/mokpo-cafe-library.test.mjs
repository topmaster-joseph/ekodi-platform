import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('Mokpo library board is wired from the presbytery and mission sites', () => {
  const home = read('sites/mokpo-presbytery/index.html');
  const mission = read('sites/mokpo-presbytery/mission/index.html');
  const board = read('sites/mokpo-presbytery/library/index.html');
  const builder = read('scripts/build.mjs');
  assert.match(home, /href="\/mokpo-presbytery\/library\/"/);
  assert.match(mission, /href="\/mokpo-presbytery\/library\/\?scope=선교부"/);
  assert.match(board, /id="libraryRows"/);
  assert.match(board, /href="https:\/\/cafe\.daum\.net\/pckmp"/);
  assert.match(board, /공식 노회 홈페이지가 아닙니다/);
  assert.match(builder, /sites\/mokpo-presbytery\/library/);
});

test('unverified entries never claim a real original attachment or copied text', () => {
  const catalog = JSON.parse(read('sites/mokpo-presbytery/library/catalog.json'));
  assert.equal(catalog.schema_version, 1);
  assert.ok(catalog.records.length >= 2);
  for (const doc of catalog.records) {
    assert.ok(doc.title && doc.scope && doc.category);
    if (doc.state === 'metadata_only') {
      assert.equal(doc.content, null);
      assert.equal(doc.source.post_url, null);
      assert.deepEqual(doc.attachments, []);
    } else {
      assert.equal(doc.state, 'approved_mirror');
      assert.ok(doc.content && doc.source.post_url && doc.source.verified_at);
    }
  }
  const app = read('sites/mokpo-presbytery/library/board.js');
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
  assert.match(app, /\.textContent/);
  assert.match(app, /noopener noreferrer/);
});
