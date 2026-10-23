import test from 'node:test';
import assert from 'node:assert/strict';
import {storeAdminScript} from '../store-admin-engine.js';

test('store admin client wraps every fetch with a deadline so the panel cannot hang on the loading card',async()=>{
  const js=await storeAdminScript().text();
  assert.match(js,/const FETCH_TIMEOUT_MS=\d+/);
  assert.match(js,/new AbortController\(\)/);
  assert.match(js,/code:'CLIENT_TIMEOUT'/);
  assert.match(js,/globalThis\.fetch\(input/);
});
