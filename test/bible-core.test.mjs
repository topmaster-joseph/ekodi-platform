import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readBiblePassage, readBibleReference, searchBible } from '../bible-core.js';

const root = path.resolve('bible');
const request = new Request('https://bible.ekodi.kr/');
const env = {
  ASSETS: {
    async fetch(input) {
      const url = new URL(input.url);
      const file = path.join(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
      try {
        const body = await fs.readFile(file);
        return new Response(body, { status:200, headers:{ 'content-type':'application/json; charset=utf-8' } });
      } catch {
        return new Response('not found', { status:404 });
      }
    },
  },
};

test('KRV1961 returns verbatim Korean passage', async () => {
  const result = await readBibleReference(request, env, '창세기 1:1', 'KRV1961');
  assert.equal(result.ok, true);
  assert.equal(result.integrity, 'verbatim');
  assert.equal(result.verses.length, 1);
  assert.equal(result.verses[0].text, '태초에 하나님이 천지를 창조하시니라');
});
test('NKRV never returns stored Bible text', async () => {
  const result = await readBiblePassage(request, env, { provider:'NKRV', book:'신명기', chapter:17, verseStart:14, verseEnd:20 });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'official-link-only');
  assert.deepEqual(result.verses, []);
  assert.match(result.officialUrl, /bible\.bskorea\.or\.kr\/bible\/NKRV\/DEU\.17$/);
});

test('KRV search returns exact stored verses', async () => {
  const result = await searchBible(request, env, '하나님', 5);
  assert.equal(result.ok, true);
  assert.ok(result.results.length > 0);
  assert.ok(result.results.every(row => row.text.includes('하나님')));
  assert.equal(result.integrity, 'verbatim');
});

test('Korean reference range resolves correctly', async () => {
  const result = await readBibleReference(request, env, '신명기 17:14-20', 'KRV1961');
  assert.equal(result.ok, true);
  assert.equal(result.book.id, 'DEU');
  assert.equal(result.chapter, 17);
  assert.equal(result.verseStart, 14);
  assert.equal(result.verseEnd, 20);
  assert.equal(result.verses.length, 7);
});

test('Bible staging preserves Access protection and verifies the staged contract locally', async () => {
  const workflow = await fs.readFile(path.resolve('.github/workflows/deploy-bible.yml'), 'utf8');
  assert.match(workflow, /Www-Authenticate: Cloudflare-Access/i);
  assert.match(workflow, /deployments status --config wrangler\.bible\.staging\.toml/);
  assert.ok(workflow.includes("WRANGLER_VERSION: '4.129.0'"));
  assert.ok(workflow.includes('wrangler@${WRANGLER_VERSION} dev --config wrangler.bible.staging.toml --local'));
  assert.match(workflow, /verify_base='http:\/\/127\.0\.0\.1:8793'/);
});