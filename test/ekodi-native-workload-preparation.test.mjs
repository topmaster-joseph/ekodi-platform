import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  nextSundayKst,monthKst,worshipPreparation,publishingPreparation,collectNativePreparation
} from '../scripts/ekodi-native-workload-preparation.mjs';

const when=new Date('2026-10-30T02:49:00Z');
const november=JSON.parse(await readFile(new URL('../config/common-scripture/2026-11.json',import.meta.url),'utf8'));

test('KST Sunday, month and DST-safe day boundary are authoritative',()=>{
  assert.equal(nextSundayKst(when),'2026-11-01');
  assert.equal(monthKst(when),'2026-10');
  assert.equal(nextSundayKst(new Date('2026-11-01T02:00:00Z')),'2026-11-01');
  assert.equal(nextSundayKst(new Date('2026-10-31T15:01:00Z')),'2026-11-01');
  assert.equal(monthKst(new Date('2026-10-31T15:01:00Z')),'2026-11');
});
test('approved first-party common scripture is required and is never mistaken for a finished sermon',()=>{
  const item=worshipPreparation('2026-11-01',november);
  assert.equal(item.scripture,'고린도전서 3:1-9');
  assert.equal(item.devotionTitle,'자라게 하시는 이는 하나님');
  assert.equal(item.scheduledFor,'2026-11-01');
  assert.equal(item.scriptureRegistryId,november.id);
  assert.equal(item.evidenceVerified,false);
  assert.equal(item.canDisableChatgptTask,false);
  assert.equal(item.deliverables.sermonGoogleDocId,null);
  assert.equal(item.deliverables.bulletinGoogleDocId,null);
  assert.equal(item.deliverables.worshipGoogleSlidesId,null);
  assert.equal(item.dispatched,false);
  assert.equal(item.mutations,0);
  assert.equal(worshipPreparation('2026-11-01',{...november,status:'draft'}).status,'blocked');
  assert.equal(worshipPreparation('2026-11-01',{...november,month:'2026-12'}).status,'blocked');
  assert.equal(worshipPreparation('2026-11-31',november).status,'blocked');
  assert.equal(worshipPreparation('2026-11-01',{...november,readings:['']}).status,'blocked');
});
test('publishing produces six planning slots but never invents books or release receipts',async()=>{
  const item=(await collectNativePreparation({now:when,loadRegistry:async()=>november})).publishing;
  assert.equal(item.id,'ekodi:human-publishing:2026-10');
  assert.equal(item.slots.length,6);
  assert.ok(item.slots.every(x=>x.state==='planning_only'&&!x.releaseVerified));
  assert.equal(item.verifiedPublications,0);
  assert.equal(item.evidenceVerified,false);
  assert.equal(item.canDisableChatgptTask,false);
  assert.equal(item.dispatched,false);
  assert.equal(item.mutations,0);
  assert.equal(publishingPreparation('2026-10',[item.slots[0]]).status,'blocked');
});
test('registry unavailable is fail closed and native scheduler never calls model or writes',async()=>{
  const result=await collectNativePreparation({now:when,loadRegistry:async()=>{throw new Error('offline');}});
  assert.equal(result.church.status,'blocked');
  assert.equal(result.church.reason,'approved_date_scripture_missing');
  assert.equal(result.publishing.slots.length,6);
  assert.equal(result.modelCalls,0);
  assert.equal(result.scheduledWrites,0);
  assert.equal(result.salesOrPublicationActions,0);
  assert.equal(result.chatgptTaskDisables,0);
  assert.equal(result.complete,false);
  assert.ok(!JSON.stringify(result).includes('offline'));
});
test('native watch integrates authoritative input manifest without extra schedules or credentials',async()=>{
  const [script,watch,workflow]=await Promise.all([
    readFile(new URL('../scripts/ekodi-native-workload-preparation.mjs',import.meta.url),'utf8'),
    readFile(new URL('../scripts/ekodi-native-operations-watch.mjs',import.meta.url),'utf8'),
    readFile(new URL('../.github/workflows/ekodi-native-operations-watch.yml',import.meta.url),'utf8')
  ]);
  assert.match(watch,/collectNativePreparation/);
  assert.match(watch,/automationPreparation/);
  assert.match(workflow,/cron: '37 \* \* \* \*'/);
  assert.match(workflow,/cron: '45 23 \* \* \*'/);
  assert.doesNotMatch(script,/api\.openai\.com|chatgpt\.com|method:'POST'|updateAutomation\(/);
  assert.doesNotMatch(script,/fetch\(|writeFile\(|\.run\(|\.prepare\(/);
});
