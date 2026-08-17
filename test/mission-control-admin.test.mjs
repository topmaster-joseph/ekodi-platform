import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Mission Control browser module parses and exposes six stable primary perspectives',async()=>{
  const source=await read('mission-control-admin.js');
  assert.doesNotThrow(()=>new Function(source));
  for(const label of ['Campus','Today','People','Money','AI','More']) assert.match(source,new RegExp(`label:'${label}'`));
  assert.match(source,/mission-primary-nav/);
  assert.match(source,/mission-secondary-nav/);
});

test('Mission Control centers today brief, human decisions, timeline and AI crew',async()=>{
  const source=await read('mission-control-admin.js');
  assert.match(source,/TODAY BRIEF/);
  assert.match(source,/DECISION INBOX/);
  assert.match(source,/TIME MACHINE/);
  assert.match(source,/AI CREW/);
  assert.match(source,/LIVE ECOSYSTEM/);
  assert.match(source,/Mission Control/);
});

test('Mission Control remains observation-first and routes risky actions to the existing Chief AI gate',async()=>{
  const source=await read('mission-control-admin.js');
  assert.match(source,/\/api\/control\/overview/);
  assert.match(source,/\/api\/control\/check/);
  assert.match(source,/CORE_DOMAINS/);
  assert.match(source,/Chief AI와 검토/);
  assert.doesNotMatch(source,/fetch\([^\n]*(delete|destroy|drop|dns\/update|billing\/charge)/i);
  assert.doesNotMatch(source,/service[_-]?role/i);
});

test('Mission Control is shipped only through the authenticated admin shell',async()=>{
  const [build,html]=await Promise.all([read('scripts/build.mjs'),read('control-center.html')]);
  assert.match(build,/'mission-control-admin\.css'/);
  assert.match(build,/'mission-control-admin\.js'/);
  assert.match(build,/data-ekodi-postauth="[^"]*mission-control-admin\.css mission-control-admin\.js/);
  assert.doesNotMatch(html,/mission-control-admin\.(?:js|css)/);
});

test('Mission Control keeps existing AI Ops and Chief AI contracts instead of duplicating privileged control',async()=>{
  const [mission,aiOps,lazy]=await Promise.all([read('mission-control-admin.js'),read('ai-ops-admin.js'),read('admin-lazy-features.js')]);
  assert.match(mission,/routeSection\('aiops'\)/);
  assert.match(aiOps,/Decision Gate/);
  assert.match(aiOps,/SITE FLEET/);
  assert.match(lazy,/CHIEF AI CONVERSATION/);
  assert.match(lazy,/installChiefChat/);
});
