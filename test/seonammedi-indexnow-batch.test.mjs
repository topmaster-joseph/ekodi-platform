import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INDEXNOW_ENDPOINTS, indexNowPayload, submitIndexNowBatches } from '../scripts/seonammedi-indexnow-batch.mjs';

const canonicalOrigin = 'https://xn--3e0b8b58jw4co4mnpll3k.kr';
const key = 'fc1e3ad82010475381daf9846e627fdd';
const urls = [canonicalOrigin+'/',canonicalOrigin+'/board/notices',canonicalOrigin+'/board/voices',canonicalOrigin+'/board/notices/29'];

test('IndexNow batch uses Naver, Bing and global HTTP endpoints and public root key', () => {
  assert.deepEqual(INDEXNOW_ENDPOINTS.map(x=>x[0]), ['naver','bing','indexnow']);
  const result = indexNowPayload({urls,key,canonicalOrigin});
  assert.deepEqual(result, {
    host:'xn--3e0b8b58jw4co4mnpll3k.kr', key,
    keyLocation: canonicalOrigin+'/'+key+'.txt', urlList:urls,
  });
});

test('one POST per participating search service submits all public sitemap URLs', async () => {
  const calls=[];
  const r=await submitIndexNowBatches({urls,key,canonicalOrigin,fetchImpl:async (uri, init)=>{
    calls.push({uri,init});
    assert.equal(init.method,'POST');
    assert.equal(init.headers['content-type'],'application/json; charset=utf-8');
    assert.deepEqual(JSON.parse(init.body).urlList,urls);
    assert.equal(JSON.parse(init.body).host,'xn--3e0b8b58jw4co4mnpll3k.kr');
    return {status:calls.length===1?200:202};
  }});
  assert.equal(r.ok,true);
  assert.equal(r.urlCount,4);
  assert.equal(calls.length,3);
  assert.deepEqual(r.results.map(x=>x.status),[200,202,202]);
});

test('IndexNow records provider failures individually without hiding errors', async () => {
  let n=0;
  const r=await submitIndexNowBatches({urls,key,canonicalOrigin,fetchImpl:async()=>{
    n++;
    if(n===1)throw Object.assign(new Error('network'),{name:'TimeoutError'});
    return {status:n===2?429:200};
  }});
  assert.equal(r.ok,false);
  assert.deepEqual(r.results.map(x=>x.status),[0,429,200]);
  assert.equal(r.results[0].error,'TimeoutError');
});

test('IndexNow batch fails closed on incorrect key, host, duplicate or invalid published links', async () => {
  for(const arg of [
    {key:'unsafe key'},
    {canonicalOrigin:'https://seonammedi.kr'},
    {urls:[...urls,'https://other.example/']},
    {urls:[...urls,urls[0]]},
    {urls:[...urls,canonicalOrigin+'/admin/']},
    {urls:[]},
  ]){
    await assert.rejects(submitIndexNowBatches({
      urls,key,canonicalOrigin,...arg,fetchImpl:async()=>{throw Error('should not submit');}
    }));
  }
});

test('workflow performs native POST and does not download Playwright or Chromium', async () => {
  const wf=await readFile(new URL('../.github/workflows/submit-seonammedi-indexnow.yml',import.meta.url),'utf8');
  const source=await readFile(new URL('../scripts/ekodi-search-index-submit.mjs',import.meta.url),'utf8');
  assert.match(source,/submitIndexNowBatches/);
  assert.match(source,/canonicalIndexNowUrlsFromSitemap/);
  assert.match(wf,/node --test test\/seonammedi-indexnow-batch\.test\.mjs/);
  assert.doesNotMatch(wf,/playwright|chromium|with-deps/i);
  assert.doesNotMatch(source,/playwright|chromium|page\.goto|newContext/i);
});
