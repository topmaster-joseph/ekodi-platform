import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleSeonamMediCivicApi,consumeSeonamMediVoiceMessage,SEONAMMEDI_VOICE_QUEUE_KIND} from '../seonammedi-civic-control.js';

test('retired SeonamMedi civic API points callers to standalone citizen board',async()=>{
  const response=await handleSeonamMediCivicApi(new Request('https://seonammedi.kr/api/seonammedi/voices'),{});
  assert.equal(response.status,410);
  const body=await response.json();
  assert.equal(body.error,'legacy_citizen_voice_retired');
  assert.equal(body.location,'https://seonammedi.kr/board/voices');
  assert.match(response.headers.get('link')||'',/https:\/\/seonammedi\.kr\/board\/voices/);

  const health=await handleSeonamMediCivicApi(new Request('https://seonammedi.kr/api/seonammedi/voices/health'),{});
  assert.equal(health.status,200);
  const healthBody=await health.json();
  assert.equal(healthBody.retired,true);
  assert.equal(healthBody.location,'https://seonammedi.kr/board/voices');
  assert.equal(healthBody.queueDrain,'ack-drop');
});

test('queued legacy citizen voice envelopes are acknowledged without persistence',async()=>{
  assert.equal(await consumeSeonamMediVoiceMessage({kind:SEONAMMEDI_VOICE_QUEUE_KIND,payload:{message:'must not persist'}},{}),true);
  assert.equal(await consumeSeonamMediVoiceMessage({kind:'other.write.v1'},{}),false);
});

test('legacy shared-D1 citizen voice rows are cleared after standalone cutover',async()=>{
  const migration=await readFile(new URL('../migrations/0128_seonammedi_retire_legacy_civic_voice.sql',import.meta.url),'utf8');
  const replies=migration.indexOf('DELETE FROM seonammedi_civic_voice_replies');
  const voices=migration.indexOf('DELETE FROM seonammedi_civic_voices');
  assert.ok(replies>=0&&voices>replies);
  assert.doesNotMatch(migration,/DROP TABLE|DROP COLUMN|ALTER TABLE .* RENAME/i);
});


test('shared-site release manifest verifies the retired civic health contract',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const requests=manifest?.verification?.requests||manifest?.verify?.requests||manifest?.requests||[];
  const check=requests.find(item=>item?.url==='https://ekodi.kr/api/seonammedi/voices/health');
  assert.ok(check,'voices health verification entry missing');
  const markers=[...(check.expect||[]),...(check.bodyIncludes||[])].join(' ');
  assert.match(markers,/\"retired\":true/);
  assert.match(markers,/\"queueDrain\":\"ack-drop\"/);
  assert.doesNotMatch(markers,/\"storage\":\"d1\"|\"canonicalTable\":true/);
});
