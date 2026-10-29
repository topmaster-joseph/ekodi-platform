import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import seonam, { SEONAMMEDI_ENGLISH_NAVER_FILE_PATH, SEONAMMEDI_ENGLISH_NAVER_FILE_BODY } from '../seonammedi-domain-gateway.js';
import cgma, { CGMA_NAVER_FILE_PATH, CGMA_NAVER_FILE_BODY } from '../cgma-naver-proof-worker.js';
import { verificationMetaTags } from '../search-engine-verification.js';

test('seonammedi.kr returns its exact owner-issued Naver HTML proof at own root', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {throw new Error('verification should not fetch upstream');};
  try {
    assert.equal(SEONAMMEDI_ENGLISH_NAVER_FILE_PATH, '/navera1df00235ac98ccb6796021cd7feb55a.html');
    const r = await seonam.fetch(new Request('https://seonammedi.kr' + SEONAMMEDI_ENGLISH_NAVER_FILE_PATH));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('location'), null);
    assert.equal(await r.text(), SEONAMMEDI_ENGLISH_NAVER_FILE_BODY);
    const h = await seonam.fetch(new Request('https://seonammedi.kr' + SEONAMMEDI_ENGLISH_NAVER_FILE_PATH, { method: 'HEAD' }));
    assert.equal(h.status, 200);
    assert.equal(await h.text(), '');
  } finally { globalThis.fetch = original; }
});

test('English and Korean customer domains retain distinct owner evidence', () => {
  assert.ok(verificationMetaTags('seonammedi.kr').includes('fda2f0e54ea106c29233baaa602aa5a551c79b88'));
  assert.ok(!verificationMetaTags('xn--3e0b8b58jw4co4mnpll3k.kr').includes('fda2f0e54ea106c29233baaa602aa5a551c79b88'));
  assert.ok(verificationMetaTags('xn--3e0b8b58jw4co4mnpll3k.kr').includes('24ca4ba6e96faad3747dd25f3df3b1748384771a'));
  assert.ok(!verificationMetaTags('cgma.or.kr').includes('fda2f0e54ea106c29233baaa602aa5a551c79b88'));
});

test('CGMA proof Worker serves only its owner-issued file and never changes rest of website', async () => {
  assert.equal(CGMA_NAVER_FILE_PATH, '/navere5d0557aef9688f08735f4bf0152c795.html');
  const r = await cgma.fetch(new Request('https://cgma.or.kr' + CGMA_NAVER_FILE_PATH));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('location'), null);
  assert.equal(await r.text(), CGMA_NAVER_FILE_BODY);
  const h = await cgma.fetch(new Request('https://cgma.or.kr' + CGMA_NAVER_FILE_PATH,{ method:'HEAD' }));
  assert.equal(h.status, 200);
  assert.equal(await h.text(), '');
  for(const url of ['https://cgma.or.kr/','https://seonammedi.kr' + CGMA_NAVER_FILE_PATH,'https://cgma.or.kr' + CGMA_NAVER_FILE_PATH+'.bak']){
    const invalid=await cgma.fetch(new Request(url));
    assert.equal(invalid.status,404,url);
  }
  const post=await cgma.fetch(new Request('https://cgma.or.kr'+CGMA_NAVER_FILE_PATH,{method:'POST'}));
  assert.equal(post.status,405);
});

test('CGMA ownership route is narrowly deployed and release-gated without DNS mutations', async () => {
  const toml = await readFile(new URL('../wrangler.cgma-naver-proof.toml',import.meta.url),'utf8');
  const wf = await readFile(new URL('../.github/workflows/deploy-cgma-naver-proof.yml',import.meta.url),'utf8');
  const lanes = JSON.parse(await readFile(new URL('../config/worker-deploy-lanes.json',import.meta.url),'utf8'));
  assert.ok(toml.includes('cgma.or.kr/navere5d0557aef9688f08735f4bf0152c795.html*'));
  assert.ok(!toml.includes('custom_domain = true'));
  assert.equal(lanes.workers['wrangler.cgma-naver-proof.toml']?.workflow,'deploy-cgma-naver-proof.yml');
  assert.ok(wf.includes('validate-ekodi-ai-change-orchestration.mjs'));
  assert.ok(wf.includes('wrangler.cgma-naver-proof.toml'));
  assert.ok(wf.includes('CGMA Naver owner proof HTTP'));
  assert.ok(!wf.includes('-X DELETE') && !wf.includes('-X PATCH') && !wf.includes('dns_records'));
});
