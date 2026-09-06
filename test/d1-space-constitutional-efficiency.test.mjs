import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('control monitoring uses compact D1 read models instead of raw-log scans',async()=>{
  const [api,migration]=await Promise.all([
    read('api-worker.js'),
    read('migrations/0061_control_monitoring_read_model.sql')
  ]);
  assert.ok(api.includes('service_check_latest'));
  assert.ok(api.includes('service_check_hourly'));
  assert.ok(api.includes("SELECT * FROM service_check_latest"));
  assert.ok(api.includes('FROM service_check_hourly'));
  assert.ok(!api.includes('SELECT c.* FROM service_checks c'));
  assert.ok(!api.includes("async function ensureControlSchema"));
  assert.ok(!api.includes("CREATE TABLE IF NOT EXISTS service_checks"));
  assert.match(migration,/CREATE TABLE IF NOT EXISTS service_check_latest/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS service_check_hourly/);
});

test('high-frequency D1 paths do not scan sqlite_master',async()=>{
  const [publishing,evolution]=await Promise.all([
    read('marketing-publishing-worker.js'),
    read('evolution-intelligence-store.js')
  ]);
  assert.doesNotMatch(publishing,/sqlite_master/);
  assert.doesNotMatch(evolution,/sqlite_master/);
  const scheduler=publishing.slice(publishing.indexOf('async function runScheduler'),publishing.indexOf('\nexport default {'));
  assert.doesNotMatch(scheduler,/schemaReady\(/);
  assert.match(scheduler,/no such table/i);
});
test('Space stays an internal engine while public aliases follow canonical workspace routing',async()=>{
  const [worker,manifest,shell,services,policy]=await Promise.all([
    read('space-worker.js'),read('ekodi-service-manifest.js'),read('shell/shell.js'),
    read('config/ecosystem-services.json'),read('config/service-workspace-policy.json')
  ]);
  assert.match(worker,/legacyAlias=url\.hostname\.toLowerCase\(\)==='space\.ekodi\.kr'/);
  assert.match(worker,/status:308/);
  assert.match(worker,/new URL\(url\.pathname\+url\.search,'https:\/\/ekodi\.kr'\)/);
  assert.match(worker,/location:'https:\/\/my\.ekodi\.kr\/'/);
  assert.match(manifest,/id:'space'[^\n]*selectorHidden:true/);
  assert.match(shell,/s\.id!=='my'&&!s\.selectorHidden/);
  const registrySpace=JSON.parse(services).services.find(service=>service.id==='space');
  assert.equal(registrySpace?.userVisible,false);
  assert.equal(registrySpace?.registryRole,'internal-workspace-engine');
  const routing=JSON.parse(policy).publicWorkspaceRouting;
  assert.equal(routing.canonicalPattern,'/{slug}');
  assert.equal(routing.kindEncodedInUrl,false);
  assert.equal(routing.legacyRedirects['space.ekodi.kr/{slug}'],'ekodi.kr/{slug}');
});

test('workspace kinds remain metadata, not public path prefixes',async()=>{
  const constitution=await read('CONSTITUTION.md');
  assert.match(constitution,/Workspace kind is internal metadata and is never encoded into the public URL/);
  assert.match(constitution,/ekodi\.kr\/\{slug\}/);
  assert.match(constitution,/Workspace type-prefixed public routes are retired/);
  for(const kind of ['personal','org','group','project']){
    assert.doesNotMatch(constitution,new RegExp(`canonical.*\\/${kind}\\/\\{slug\\}`,'i'));
  }
});

test('Marketing Publishing migration gate uses zero-row probes for the full channel schema',async()=>{
  const workflow=await read('.github/workflows/deploy-marketing-publishing.yml');
  const start=workflow.indexOf('Wait for shared D1 migration gate on normal production push');
  const end=workflow.indexOf('Verify production D1 publication tables and entitlement triggers',start);
  assert.ok(start>=0&&end>start);
  const gate=workflow.slice(start,end);
  assert.doesNotMatch(gate,/sqlite_master/);
  assert.match(gate,/SELECT 1 FROM marketing_publication_jobs LIMIT 0/);
  assert.match(gate,/SELECT 1 FROM channel_automation_profiles LIMIT 0/);
  assert.match(gate,/SELECT 1 FROM channel_oauth_connections LIMIT 0/);
  assert.match(gate,/SELECT 1 FROM channel_provider_schedules LIMIT 0/);
});