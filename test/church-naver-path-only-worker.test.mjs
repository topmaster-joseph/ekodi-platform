import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, { CHURCH_HOST, CHURCH_NAVER_PATH } from '../church-naver-proof-worker.js';

test('dedicated church Worker serves exact Naver verification at original hostname only', async () => {
  assert.equal(CHURCH_HOST, 'ekodichurch.kr');
  assert.equal(CHURCH_NAVER_PATH, '/naver85321326d5553a0caa3a944158fc2969.html');
  const get = await worker.fetch(new Request('https://ekodichurch.kr' + CHURCH_NAVER_PATH));
  assert.equal(get.status, 200);
  assert.match(get.headers.get('content-type'), /text\/html/);
  assert.equal(await get.text(), 'naver-site-verification: naver85321326d5553a0caa3a944158fc2969.html');
  const head = await worker.fetch(new Request('https://ekodichurch.kr' + CHURCH_NAVER_PATH, {method:'HEAD'}));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('dedicated path worker cannot impersonate or redirect other routes', async () => {
  for (const url of [
    'https://ekodichurch.kr/',
    'https://ekodichurch.kr/naver85321326d5553a0caa3a944158fc2969.html.backup',
    'https://ekodibiz.kr/naver85321326d5553a0caa3a944158fc2969.html',
    'https://ekodimall.kr/naver85321326d5553a0caa3a944158fc2969.html',
  ]) {
    const res = await worker.fetch(new Request(url));
    assert.equal(res.status, 404, url);
    assert.equal(res.headers.get('location'), null);
  }
  const post = await worker.fetch(new Request('https://ekodichurch.kr' + CHURCH_NAVER_PATH, {method:'POST'}));
  assert.equal(post.status, 405);
});

test('Wrangler owns only a route for exact church Naver file, never the whole domain', async () => {
  const config = await readFile(new URL('../wrangler.church-naver-proof.toml', import.meta.url), 'utf8');
  assert.match(config, /main = "church-naver-proof-worker\.js"/);
  assert.match(config, /pattern = "ekodichurch\.kr\/naver85321326d5553a0caa3a944158fc2969\.html\*"/);
  assert.match(config, /zone_name = "ekodichurch\.kr"/);
  assert.doesNotMatch(config, /^\s*custom_domain\s*=\s*true/m);
  assert.doesNotMatch(config, /^(?!\s*#).*ekodimall\.kr|^(?!\s*#).*ekodilab\.kr/m);
});

test('Official guarded manual deployment modifies no unrelated topology and checks live ownership', async () => {
  const wf = await readFile(new URL('../.github/workflows/deploy-church-naver-proof.yml', import.meta.url), 'utf8');
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(wf, /wrangler\.church-naver-proof\.toml/);
  assert.match(wf, /naver85321326d5553a0caa3a944158fc2969\.html/);
  assert.match(wf, /https:\/\/ekodichurch\.kr\//);
  // Cloudflare One-Rule PATCH is permitted only through our guarded, target-
  // checked script. The workflow must still never mutate DNS or Pages.
  assert.doesNotMatch(wf, /\bDELETE\b|dns_records\b|pages\/projects\b/);
  assert.doesNotMatch(wf, /curl[^\n]*-X\s+PATCH/);
  assert.match(wf, /node scripts\/cloudflare-church-naver-redirect-exception\.mjs/);
  const fix = await readFile(new URL('../scripts/cloudflare-church-naver-redirect-exception.mjs', import.meta.url), 'utf8');
  assert.match(fix, /'PATCH'/);
  assert.match(fix, /RULE_NAME = 'EKODI Church canonical path redirect'/);
  assert.doesNotMatch(fix, /['"]PUT['"]|dns_records|pages\/projects/);
  const lanes = JSON.parse(await readFile(new URL('../config/worker-deploy-lanes.json', import.meta.url), 'utf8'));
  assert.equal(lanes.workers['wrangler.church-naver-proof.toml']?.workflow, 'deploy-church-naver-proof.yml');
});
