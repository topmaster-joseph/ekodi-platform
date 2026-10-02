import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_DISCOVERY_URLS,
  STORE_INDEXNOW_KEY,
  STORE_INDEXNOW_KEY_PATH,
  STORE_INDEXNOW_KEY_URL,
  isStoreIndexNowKeyPath,
  storeIndexNowKeyResponse,
} from '../store-indexnow.js';

test('store IndexNow key uses a valid public ownership contract',async()=>{
  assert.match(STORE_INDEXNOW_KEY,/^[a-fA-F0-9-]{8,128}$/);
  assert.equal(STORE_INDEXNOW_KEY_PATH,`/${STORE_INDEXNOW_KEY}.txt`);
  assert.equal(STORE_INDEXNOW_KEY_URL,`https://ekodi.kr/${STORE_INDEXNOW_KEY}.txt`);
  assert.equal(isStoreIndexNowKeyPath(STORE_INDEXNOW_KEY_PATH),true);
  assert.equal(isStoreIndexNowKeyPath('/wrong.txt'),false);
  const response=storeIndexNowKeyResponse();
  assert.equal(response.status,200);
  assert.equal((await response.text()).trim(),STORE_INDEXNOW_KEY);
  assert.equal(response.headers.get('x-ekodi-route'),'store-indexnow-key');
  assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
});

test('store discovery URLs submitted to IndexNow are canonical and bounded',()=>{
  assert.deepEqual(STORE_DISCOVERY_URLS,[
    'https://ekodi.kr/cmpmyi',
    'https://ekodi.kr/jadam',
    'https://ekodi.kr/pizzamaru',
    'https://ekodi.kr/yogurt',
  ]);
  assert.equal(new Set(STORE_DISCOVERY_URLS).size,STORE_DISCOVERY_URLS.length);
  for(const value of STORE_DISCOVERY_URLS){
    const url=new URL(value);
    assert.equal(url.protocol,'https:');
    assert.equal(url.hostname,'ekodi.kr');
    assert.equal(url.search,'');
    assert.equal(url.hash,'');
  }
});
