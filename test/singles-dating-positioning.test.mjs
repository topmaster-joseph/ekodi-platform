import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const env={SINGLES_PUBLIC_PREVIEW_ENABLED:'true',ASSETS:{fetch:async r=>new Response('')}};

test('consent form no longer offers a marriage-purpose connection',async()=>{
  for(const path of ['/singles','/singles/my','/singles/events']){
    const html=await (await routeSinglesSurface(new Request('https://ekodi.kr'+path),env)).text();
    assert.doesNotMatch(html,/name="marriage"/,path);
    assert.doesNotMatch(html,/결혼 목적 연결에도 참여/,path);
  }
});
test('client always sends marriage_opt_in=false and never reads a marriage field',async()=>{
  const app=await read('sites/ekodi-singles/public/app.js');
  assert.match(app,/marriage_opt_in:false\}/);
  assert.doesNotMatch(app,/form\.elements\.marriage/);
});
test('server refuses marriage-purpose connection in the dating operating mode',async()=>{
  const api=await read('supabase/functions/singles-api/index.ts');
  const i=api.indexOf('if (b.marriage_opt_in === true)');
  assert.ok(i>0);
  assert.match(api.slice(i,i+160),/marriage_connection_not_offered"? *\}, *400/);
  assert.ok(i<api.indexOf('.upsert(row'),'refusal happens before any write');
});
