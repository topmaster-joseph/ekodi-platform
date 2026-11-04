import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migrationManifest,backupInventory,inspectProduction} from '../scripts/points-production-backup-plan.mjs';

const now=new Date('2026-11-04T00:00:00Z');
const production='renzehysxirjilvdxacv';
const fixtureReady={project_ref:production,state:'points_not_installed',
  prerequisites_ok:true,missing_migrations:Array(20).fill('missing'),
  migration_count_expected:20};
const backup={region:'ap-southeast-1',walg_enabled:true,pitr_enabled:false,
  backups:[{id:999,status:'COMPLETED',inserted_at:'2026-11-03T12:00:00Z'}]};

test('exact 20 source-controlled migrations have independently verified sha256 digests',async()=>{
  const result=await migrationManifest();
  assert.equal(result.files.length,20);
  assert.match(result.manifest_sha256,/^[a-f0-9]{64}$/);
  assert.equal(new Set(result.files.map(x=>x.filename)).size,20);
  assert.ok(result.files[0].filename.includes('site_activity_points_foundation'));
  assert.ok(result.files.at(-1).filename.includes('recognition_goals_person_idx'));
  assert.ok(result.files.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)&&x.bytes>0));
  assert.ok(result.files.some(x=>x.risk_tags.includes('trigger_replacement')));
  assert.ok(result.files.some(x=>x.risk_tags.includes('security_definer')));
});

test('backup inventory requires completed recent snapshot or provable PITR checkpoint',()=>{
  const recent=backupInventory(backup,{now});
  assert.equal(recent.inventory_status,'recent_backup_visible');
  assert.equal(recent.restore_test_verified,false);
  assert.equal(recent.latest_completed_backup_utc,'2026-11-03T12:00:00.000Z');
  assert.equal(backupInventory({...backup,backups:[{status:'RUNNING',inserted_at:'2026-11-03T12:00:00Z'}]},{now}).inventory_status,'missing_or_stale_backup');
  assert.equal(backupInventory({...backup,backups:[{status:'COMPLETED',inserted_at:'2026-10-01T12:00:00Z'}]},{now}).inventory_status,'missing_or_stale_backup');
  assert.equal(backupInventory({...backup,backups:[{status:'COMPLETED',inserted_at:'2026-11-05T12:00:00Z'}]},{now}).inventory_status,'missing_or_stale_backup');
  const pitr=backupInventory({backups:[],pitr_enabled:true,
    physical_backup_data:{latest_physical_backup_date_unix:Date.parse('2026-11-03T23:00:00Z')/1000}},{now});
  assert.equal(pitr.recent_pitr_checkpoint_visible,true);
  assert.equal(pitr.restore_test_verified,false);
  assert.throws(()=>backupInventory({backups:'unknown'},{now}),/unrecognized_supabase_backup_inventory/);
});

test('production plan never emits secret, backup IDs, or authorizes data changes',async()=>{
  const requests=[];
  const fetchImpl=async(url,options)=>{
    requests.push({url,options});
    return {ok:true,json:async()=>backup};
  };
  const manifest=await migrationManifest();
  const result=await inspectProduction({token:'private-test-token',now,fetchImpl,
    readinessInspect:async()=>fixtureReady,manifestFn:async()=>manifest});
  assert.equal(result.schema_posture,'not_installed');
  assert.equal(result.missing_migration_count,20);
  assert.equal(result.production_schema_write_authorized,false);
  assert.equal(result.production_points_activation_authorized,false);
  assert.equal(result.backup_restore_owner_approval_required,true);
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.method,'GET');
  assert.equal(requests[0].url,'https://api.supabase.com/v1/projects/'+production+'/database/backups');
  assert.doesNotMatch(JSON.stringify(result),/private-test-token/);
  assert.equal(result.backup.id,undefined);
  assert.equal(result.backup.backups,undefined);
  assert.doesNotMatch(JSON.stringify(result.backup),/"id":999/);
  assert.equal(result.source_manifest_sha256,manifest.manifest_sha256);
});

test('unsupported network status or inconsistent production source blocks the plan',async()=>{
  const manifest=await migrationManifest();
  const fetchImpl=async()=>({ok:false,status:403});
  await assert.rejects(inspectProduction({token:'x',now,fetchImpl,
    readinessInspect:async()=>fixtureReady,manifestFn:async()=>manifest}),/production_backup_inventory_unavailable:403/);
  await assert.rejects(inspectProduction({token:'x',now,fetchImpl,
    readinessInspect:async()=>({...fixtureReady,project_ref:'lxcxwbdwwojjkgybbqii'}),manifestFn:async()=>manifest}),/source_environment_mismatch/);
  await assert.rejects(inspectProduction({token:'',now}),/management_credential_required/);
});

test('migration manifest fails closed on missing files and destructive SQL',async()=>{
  const fakeFile='20261104000000_ekodi_points_foundation.sql';
  await assert.rejects(migrationManifest({list:async()=>[fakeFile],read:async()=> 'select 1;'}),/requires_fresh_review/);
  const real=await migrationManifest();
  assert.equal(real.files.length,20);
  const files=Array.from({length:20},(_,i)=>'20261104'+String(i).padStart(6,'0')+'_ekodi_points_'+i+'.sql');
  await assert.rejects(migrationManifest({list:async()=>files,read:async()=> 'DROP TABLE public.people;'}),/requires_manual_security_review/);
});

test('source only permits read-only Management API GET and demands human approval',()=>{
  const s=readFileSync(new URL('../scripts/points-production-backup-plan.mjs',import.meta.url),'utf8');
  assert.match(s,/method:'GET'/);
  assert.doesNotMatch(s,/functions deploy|db push|POINTS_ENABLED\s*=\s*true/);
  assert.match(s,/production_schema_write_authorized:false/);
  assert.match(s,/production_points_activation_authorized:false/);
});
