import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bbqcgServiceStandardsCss, renderBbqcgServiceStandards } from '../bbqcg-service-standards.js';

test('BBQ service promise uses customer-owned branding and preserves noindex', async()=>{
  const response=renderBbqcgServiceStandards(new Request('https://ekodi.kr/bbqcg/service-guide'));
  const html=await response.text();
  assert.equal(response.status,200);
  assert.match(response.headers.get('x-robots-tag'),/noindex/);
  for(const phrase of ['품질','청결','서비스','BBQ 무안청계점','https://bbq.co.kr/'])assert.ok(html.includes(phrase),phrase);
  assert.doesNotMatch(html,/<h[1-6][^>]*>[^<]*EKODI|Powered by EKODI|1,500원|2% 적립|쿠폰 발급/);
  assert.match(html,/본사의 조리법·공식 매뉴얼 또는 가맹 정책을 대체하지 않습니다/);
  assert.match(html,/rel="noopener noreferrer"/);
});
test('standards page is read only, HEAD empty, CSS mobile friendly',async()=>{
  const head=renderBbqcgServiceStandards(new Request('https://ekodi.kr/bbqcg/service-guide',{method:'HEAD'}));
  assert.equal(await head.text(),'');
  const post=renderBbqcgServiceStandards(new Request('https://ekodi.kr/bbqcg/service-guide',{method:'POST'}));
  assert.equal(post.status,405);
  const css=await bbqcgServiceStandardsCss().text();
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/word-break:keep-all/);
  const worker=await readFile(new URL('../space-worker.js',import.meta.url),'utf8');
  assert.match(worker,/bbqcg\/service-guide/);
  assert.match(worker,/resolved\.source!=='store-user-sites'/);
  assert.match(worker,/bbqcg\/assets\/service-standards\.css/);
});
