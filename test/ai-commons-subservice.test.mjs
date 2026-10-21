import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeAiIdeaInput} from '../ai-commons.js';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('subservice source id is normalized without changing request identity',()=>{
  const idea=normalizeAiIdeaInput({request:'홍보 글 만들어줘',sourceServiceId:'Church!!'});
  assert.equal(idea.sourceServiceId,'church');
  assert.equal(idea.outcome,'홍보 글 만들어줘');
});

test('shared user shell ships the retired, purge-only AI entry (bottom command box removed)',()=>{
  const worker=read('ekodi-shell-worker.js');
  const entry=read('shell/user-ai-entry.js');
  assert.match(worker,/user-ai-entry\.js/);
  assert.match(worker,/x-ekodi-user-ai-entry/);
  assert.match(entry,/__EKODI_USER_AI_ENTRY_RETIRED__/);
  assert.doesNotMatch(entry,/AI로 하기|무엇을 원하세요/);
  assert.doesNotMatch(entry,/innerHTML|location\.assign/);
  assert.match(worker,/'x-ekodi-user-ai-entry',userAiEntry\?'retired'/);
});

test('central AI handoff consumes subservice source and request',()=>{
  const client=read('ai-control/commons.js');
  assert.match(client,/params\.get\('source'\)/);
  assert.match(client,/params\.get\('q'\)/);
  assert.match(client,/sourceServiceId:state\.sourceServiceId/);
});

test('request sources are deduplicated separately from requester count',()=>{
  const worker=read('ai-control-worker.js');
  const migration=read('migrations/0088_ai_commons_sources.sql');
  assert.match(worker,/recordCommonsSource/);
  assert.match(worker,/COUNT\(DISTINCT user_id\) request_count/);
  assert.match(migration,/ON ai_commons_idea_sources\(user_id, fingerprint, source_service_id\)/);
  assert.match(migration,/idx_ai_commons_sources_fingerprint/);
});

test('super-admin governance shows which subservices generated demand',()=>{
  const admin=read('ai-commons-admin.js');
  assert.match(admin,/item\.sourceServices/);
  assert.match(admin,/수요:/);
});

test('subservice handoff survives login and immediately resolves the original request',()=>{
  const client=read('ai-control/commons.js');
  assert.match(client,/url\.searchParams\.set\('return_to',assistanceReturnHref\(requestIntent\)\)/);
  assert.match(client,/return target\.href;/);
  assert.match(client,/if\(handoff\).*submitWanted\(handoff\)/s);
});

test('shell bundle fetches the AI entry in the matching response slot',()=>{
  const worker=read('ekodi-shell-worker.js');
  assert.match(worker,/safeAssetFetch\(env,userAiEntryUrl,request\)/);
  assert.match(worker,/userAiEntryResponse/);
});
