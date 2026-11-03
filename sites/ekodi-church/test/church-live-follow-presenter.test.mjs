import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../live/',import.meta.url);
const live=readFileSync(new URL('live.js',root),'utf8');
const host=readFileSync(new URL('index.html',root),'utf8');
const materials=readFileSync(new URL('worship-materials.js',root),'utf8');
test('one verified room event carries no secret or bearer credential',()=>{
  assert.match(live,/new CustomEvent\('ekodi:live:room'/);
  assert.match(live,/role:'host'/);
  assert.match(live,/role:'viewer'/);
  assert.doesNotMatch(live,/detail:\{[^}]+(?:accessKey|token|password)/);
});
test('presentation controller has explicit host-only authenticated updates',()=>{
  assert.match(materials,/roomRole!=='host'/);
  assert.match(materials,/method:'PUT'/);
  assert.match(materials,/authorization:'Bearer '\+token/);
  assert.match(materials,/deckId,index:target/);
  assert.match(materials,/publishing=true/);
  assert.match(materials,/presentation_update_failed/);
  assert.match(host,/id="worshipHostNext"/);
  assert.match(host,/id="worshipHostPrev"/);
});
test('presenter following is opted into and fails safe independently of media',()=>{
  assert.match(materials,/let followPresenter=false/);
  assert.match(materials,/function setFollow\(enabled\)/);
  assert.match(materials,/setInterval\(\(\)=>void readPresenterSlide\(\),10000\)/);
  assert.match(materials,/document.visibilityState==='hidden'/);
  assert.match(materials,/response.status===429\|\|response.status===1027/);
  assert.match(materials,/setFollow\(false\);moveSlide/);
  assert.match(host,/id="viewerFollowPresenter" aria-pressed="false"/);
  assert.match(host,/id="viewerSlideSyncStatus"/);
  new Function(materials);
});
