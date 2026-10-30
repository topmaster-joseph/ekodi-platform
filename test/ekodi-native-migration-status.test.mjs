import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  AUTOMATION_MIGRATION_PR,LEGACY_MIGRATION_WORKLOADS,LEGACY_TASK_SNAPSHOT,
  projectEkodiNativeMigration,renderEkodiMigrationSummary
} from '../scripts/ekodi-native-migration-status.mjs';
import {collectEkodiNativeWatch} from '../scripts/ekodi-native-operations-watch.mjs';

const SHA='0123456789abcdef0123456789abcdef01234567';
const repo=number=>({number,base:{ref:'main'},head:{sha:SHA},merged_at:null,merge_commit_sha:null});
const okSnap=(id,number)=>({id,ok:true,response:repo(number)});
const htmls=AUTOMATION_MIGRATION_PR.map(x=>okSnap(x.id,x.number));
test('migration is independently classified for two official EKODI protected PRs',()=>{
  const data=projectEkodiNativeMigration({proposals:htmls});
  assert.deepEqual(data.nativePrs.map(x=>x.pr),[7044,6920]);
  assert.ok(data.nativePrs.every(x=>x.state==='pending'));
  assert.equal(data.owner,'EKODI Orchestrator');
  assert.equal(data.externalActionsTaken,0);
  assert.equal(data.authorizedToChangeLegacy,false);
  assert.equal(data.verifiedLegacyDisabledCount,0);
  assert.equal(data.migrationCompleted,false);
  assert.equal(data.tasks.length,5);
  assert.ok(data.tasks.every(x=>x.cutoverAllowed===false));
});
test('a merged source is NOT proof that real automation delivery exists',()=>{
  const snaps=htmls.map(x=>({...x,response:{...x.response,merged_at:'2026-10-30T01:00:00Z',merge_commit_sha:SHA}}));
  const d=projectEkodiNativeMigration({proposals:snaps});
  assert.ok(d.nativePrs.every(x=>x.state==='merged_requires_runtime_proof'));
  assert.ok(d.tasks.every(x=>!x.deliveryVerified&&!x.cutoverAllowed));
  assert.match(renderEkodiMigrationSummary(d),/delivery unverified/);
});
test('malformed PR, unexpected branch, missing PR or incomplete GitHub authorization fails closed',()=>{
  assert.equal(projectEkodiNativeMigration({}).nativePrs[0].state,'unverified');
  const invalid=[
    {...htmls[0],response:{...htmls[0].response,base:{ref:'release'}}},
    {...htmls[0],response:{...htmls[0].response,head:{sha:'123'}}},
    {...htmls[0],response:{...htmls[0].response,number:100}},
    {...htmls[0],ok:false}
  ];
  for(const bad of invalid){
    const r=projectEkodiNativeMigration({proposals:[bad,htmls[1]]});
    assert.notEqual(r.nativePrs[0].state,'merged_requires_runtime_proof');
    assert.equal(r.tasks[0].cutoverAllowed,false);
  }
});
test('social and church public signals are only preliminary infrastructure observations',()=>{
  const d=projectEkodiNativeMigration({proposals:htmls,checks:[
    {name:'mall-sns-readiness',status:'ok'},{name:'approved-release-receipt',status:'ok'}
  ]});
  assert.equal(d.tasks[0].readOnlyStatus,'infrastructure_observed');
  assert.equal(d.tasks[1].readOnlyStatus,'release_receipt_observed');
  assert.equal(d.tasks[0].deliveryVerified,false);
  assert.equal(d.tasks[1].deliveryVerified,false);
  assert.ok(d.tasks[0].missingEvidence.includes('authenticated_social_ui_e2e'));
  assert.ok(d.tasks[1].missingEvidence.includes('anonymous_viewer_e2e'));
  assert.ok(d.tasks[2].missingEvidence.includes('actual_manuscript'));
  assert.ok(d.tasks[3].missingEvidence.includes('real_worship_google_slides'));
});
test('main EKODI hourly watch adds native migration evidence without generating new scheduled automation',async()=>{
  const urls=[];
  const fetchImpl=async(url,opts)=>{
    urls.push({url,opts});
    if(url.endsWith('/cgma/board/api/health'))return new Response(JSON.stringify({ok:true,boardId:'site:cgma:main',siteId:'cgma',independent:true}),{status:200});
    if(url.endsWith('/api/health'))return new Response(JSON.stringify({ok:true}),{status:200});
    if(url.endsWith('/marketing-connect-api/health'))return new Response(JSON.stringify({ok:true,schemaReady:true,oauthBroker:true,encryptedVault:true,platform:{youtubeConfigured:true,metaConfigured:true,threadsConfigured:true},mallPromotionAutomation:{channelReadiness:{youtubeConnected:true,socialPublishReady:true}}}),{status:200});
    if(url.includes('/api/seonammedi/monitor'))return new Response(JSON.stringify({ok:true,lastRun:{id:1,started_at:'2026-10-30T01:20:00Z',status:'ok',sources_checked:2,items_seen:3}}),{status:200});
    if(url.includes('/release-receipt?'))return new Response(JSON.stringify({ok:true,authorized:true,state:'completed'}),{status:200});
    if(url.includes('/actions/workflows/'))return new Response(JSON.stringify({workflow_runs:[{event:'schedule',status:'completed',conclusion:'success',id:11,created_at:'2026-10-30T01:37:00Z'}]}),{status:200});
    if(url.endsWith('/pulls/3794'))return new Response(JSON.stringify({state:'closed',merged:true}),{status:200});
    if(url.endsWith('/pulls/7044'))return new Response(JSON.stringify(repo(7044)),{status:200});
    if(url.endsWith('/pulls/6920'))return new Response(JSON.stringify(repo(6920)),{status:200});
    return new Response('',{status:404});
  };
  const report=await collectEkodiNativeWatch({fetchImpl,nowMs:Date.parse('2026-10-30T02:00:00Z')});
  assert.equal(report.result,'ok');
  assert.ok(report.automationMigration);
  assert.equal(report.automationMigration.nativePrs[0].state,'pending');
  assert.equal(report.automationMigration.nativePrs[1].state,'pending');
  assert.ok(urls.every(x=>x.opts.method==='GET'&&x.opts.redirect==='error'));
  assert.ok(urls.every(x=>!String(x.url).includes('openai.com')));
  assert.equal(urls.filter(x=>x.url.includes('/pulls/7044')).length,1);
  assert.equal(urls.filter(x=>x.url.includes('/pulls/6920')).length,1);
});
test('privacy and fail-closed behavior are preserved, no forged legacy task disable',async()=>{
  const script=await readFile(new URL('../scripts/ekodi-native-migration-status.mjs',import.meta.url),'utf8');
  const runner=await readFile(new URL('../scripts/ekodi-native-operations-watch.mjs',import.meta.url),'utf8');
  assert.equal(LEGACY_MIGRATION_WORKLOADS.length,5);
  assert.doesNotMatch(script,/fetch\(|api\.openai\.com|chatgpt\.com|method:'POST'|updateAutomation/);
  assert.match(runner,/AUTOMATION_MIGRATION_PR/);
  assert.match(runner,/projectEkodiNativeMigration/);
  assert.match(runner,/report\.automationMigration/);
  const d=projectEkodiNativeMigration({proposals:[{...htmls[0],response:{number:7044,base:{ref:'main'},head:{sha:SHA},merged_at:'2026-10-30',merge_commit_sha:SHA,accessToken:'not-to-be-retained'}}]});
  assert.ok(!JSON.stringify(d).includes('not-to-be-retained'));
});

test('fifth active workload is Church Naver and stale Mission remains inactive historical',()=>{
  const x=projectEkodiNativeMigration({proposals:htmls});
  const naver=x.tasks.find(t=>t.id==='church-naver-ownership-and-index');
  assert.ok(naver);
  assert.equal(naver.kind,'monitor');
  assert.equal(naver.deliveryVerified,false);
  assert.equal(naver.cutoverAllowed,false);
  assert.ok(naver.missingEvidence.includes('native_naver_ownership_status_evidence'));
  assert.ok(naver.missingEvidence.includes('verified_production_cloudflare_release_sha'));
  assert.ok(naver.missingEvidence.includes('legacy_disable_receipt'));
  assert.equal(LEGACY_MIGRATION_WORKLOADS.find(t=>t.id===naver.id).trackingPr,7036);
  assert.equal(x.tasks.some(t=>t.id==='mission-home-production-e2e'),false);
  assert.ok(x.importedTaskSnapshot.inactivePreviouslyTracked.includes('mission-home-production-e2e'));
  assert.equal(LEGACY_TASK_SNAPSHOT.activeTaskCount,0);
  assert.equal(LEGACY_TASK_SNAPSHOT.previouslyActivePausedCount,5);
  assert.equal(LEGACY_TASK_SNAPSHOT.freshness,'historical_snapshot_not_live');
  assert.equal(LEGACY_TASK_SNAPSHOT.canDisableLegacy,false);
  assert.equal(x.authorizedToChangeLegacy,false);
});
