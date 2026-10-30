import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  selectReservationTasks,classifyChurchNaverProof,collectNativeReservations
} from '../scripts/ekodi-native-reservations.mjs';

const path=new URL('../config/ekodi-native-reservations.json',import.meta.url);
const registry=JSON.parse(await readFile(path,'utf8'));
const nav='naver-site-verification: naver85321326d5553a0caa3a944158fc2969.html';
const html='https://ekodichurch.kr/naver85321326d5553a0caa3a944158fc2969.html';

test('EKODI is sole owner; all five paused ChatGPT schedules map to one native registry',()=>{
  assert.equal(registry.owner,'EKODI Orchestrator');
  assert.equal(registry.legacyChatgpt.pausedCount,5);
  assert.equal(registry.tasks.length,5);
  assert.deepEqual(selectReservationTasks(registry,'hourly').map(x=>x.id),
    ['church-naver-owner','social-accounts-release','church-live-release']);
  assert.deepEqual(selectReservationTasks(registry,'publishing').map(x=>x.id),
    ['human-publishing-editorial']);
  assert.deepEqual(selectReservationTasks(registry,'worship').map(x=>x.id),
    ['church-weekly-worship']);
  assert.equal(selectReservationTasks(registry,'daily').length,5);
  assert.throws(()=>selectReservationTasks(registry,'invalid'),/INVALID_NATIVE_RESERVATION_PROFILE/);
});

test('church Naver actual proof requires 200 exact owner body plus legacy home 301/302',()=>{
  const ok=classifyChurchNaverProof({proofStatus:200,proofBody:nav,rootStatus:301,
    rootLocation:'https://ekodi.kr/ekodichurch/'});
  assert.equal(ok.state,'proof_url_ready_needs_provider_confirmation');
  assert.equal(ok.naverOwnershipConfirmed,false);
  assert.equal(ok.searchIndexed,false);
  for(const bad of [
    {proofStatus:301,proofBody:nav,rootStatus:301,rootLocation:'https://ekodi.kr/ekodichurch/'},
    {proofStatus:200,proofBody:'<!doctype html>',rootStatus:301,rootLocation:'https://ekodi.kr/ekodichurch/'},
    {proofStatus:200,proofBody:nav,rootStatus:200,rootLocation:''},
    {proofStatus:200,proofBody:nav,rootStatus:301,rootLocation:'https://other.example/'}
  ]) assert.equal(classifyChurchNaverProof(bad).state,'blocked');
});

test('hourly probes only two constant public URLs and never publishes or alters resources',async()=>{
  const seen=[];
  const fetchImpl=async(url,options)=>{
    seen.push({url,options});
    if(url===html)return new Response(nav,{status:200});
    if(url==='https://ekodichurch.kr/')return new Response(null,{status:301,
      headers:{location:'https://ekodi.kr/ekodichurch/'}});
    throw Error('UNEXPECTED_URL');
  };
  const r=await collectNativeReservations({registry,profile:'hourly',fetchImpl});
  assert.deepEqual(seen.map(x=>x.url),[html,'https://ekodichurch.kr/']);
  assert.ok(seen.every(x=>x.options.method==='GET'&&x.options.redirect==='manual'));
  assert.equal(r.tasks.length,3);
  assert.equal(r.tasks[0].state,'proof_url_ready_needs_provider_confirmation');
  assert.equal(r.tasks[1].actualE2EVerified,false);
  assert.equal(r.tasks[2].actualE2EVerified,false);
  assert.equal(r.productionMutations,0);
  assert.equal(r.externalAiCalls,0);
  assert.ok(r.tasks.every(x=>!x.actualWorkDelivered&&!x.cutoverParityVerified));
});

test('weekly publishing and worship use approved-source preparation without inventing deliverables',async()=>{
  const preparation={church:{status:'blocked',reason:'approved_date_scripture_missing'},
    publishing:{status:'awaiting_authorized_editorial_writer_and_storage',month:'2026-10',
      slots:[{id:'a'},{id:'b'}]}};
  const noNetwork=async()=>{throw Error('NO_EXTERNAL_NETWORK')};
  const a=await collectNativeReservations({registry,profile:'publishing',preparation,fetchImpl:noNetwork});
  const b=await collectNativeReservations({registry,profile:'worship',preparation,fetchImpl:noNetwork});
  assert.equal(a.tasks[0].plannedSlots,2);
  assert.equal(a.tasks[0].publishedBooksVerified,0);
  assert.equal(b.tasks[0].sermonDocCreated,false);
  assert.equal(b.tasks[0].slidesCreated,false);
  assert.equal(b.tasks[0].sourceStatus,'blocked');
  assert.equal(a.contentPublications,0);
});

test('existing EKODI native hourly watcher owns recurring schedules without extra workflow',async()=>{
  const wf=await readFile(new URL('../.github/workflows/ekodi-native-operations-watch.yml',import.meta.url),'utf8');
  assert.match(wf,/cron: '37 \* \* \* \*'/);
  assert.match(wf,/cron: '0 23 \* \* 0'/);
  assert.match(wf,/cron: '26 23 \* \* 2'/);
  // The weekly checks are source-only and do not repeat hourly GitHub API reads.
  assert.match(wf,/if: github\.event\.schedule != '0 23 \* \* 0' && github\.event\.schedule != '26 23 \* \* 2'/);
  assert.match(wf,/scripts\\/ekodi-native-reservations\\.mjs/);
  assert.match(wf,/ekodi-native-reservations-evidence\.json/);
  assert.doesNotMatch(wf,/contents: write|issues: write|id-token: write/);
});
