import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('EKODI common active-time client is built and served as a public, opt-in script',()=>{
  const worker=read('site-worker.js');
  const build=read('scripts/build.mjs');
  const client=read('points-active-client.js');
  assert.match(worker,/const PUBLIC_ASSETS = new Set\(\[[\s\S]*?'\/points-active-client\.js'/);
  assert.match(build,/'points-active-client\.js'/);
  assert.match(client,/export function createEkodiActivityTracker/);
  assert.match(client,/enabled===true/);
  assert.doesNotMatch(client,/service_role|SUPABASE_SERVICE_ROLE_KEY|window\.EKODI_MY_CONFIG/);
});
