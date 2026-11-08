#!/usr/bin/env node
// POINTS-SCHEMA-PLAN-001. Read-only inventory and source-hash attestation;
// no SQL writes, no backup restore, no Edge deployment and no points activation.
import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {inspect,pointMigrations,PROJECTS} from './verify-points-release-readiness.mjs';

const base=new URL('../supabase/migrations/',import.meta.url);
const sha256=text=>createHash('sha256').update(text).digest('hex');
// Security review 2026-11-08: add guard migration 20261108224500 (#7778).
// Fail closed if any further migration is added without source review.
const REQUIRED_SOURCE_COUNT=21;
const MAX_BACKUP_AGE_HOURS=48;

export async function migrationManifest({directory=base,read=readFile,list=readdir}={}){
  const filenames=(await list(directory)).filter(x=>/^[0-9]{14}_ekodi_(site_activity_points|points)_.*\.sql$/.test(x)).sort();
  const expected=pointMigrations(filenames);
  if(expected.length!==REQUIRED_SOURCE_COUNT||new Set(expected).size!==expected.length){
    throw new Error('points_migration_manifest_requires_fresh_review');
  }
  const manifest=[];
  for(const filename of filenames){
    const sql=await read(new URL(filename,directory),'utf8');
    if(!sql.trim()||sql.length>150_000||/^\s*(?:drop\s+table|truncate\s+table)\b/im.test(sql)){
      throw new Error('points_migration_requires_manual_security_review:'+filename);
    }
    const riskTags=[];
    if(/^\s*drop\s+trigger\b/im.test(sql))riskTags.push('trigger_replacement');
    if(/^\s*alter\s+table\b.+?\bdrop\s+constraint\b/im.test(sql))riskTags.push('constraint_replacement');
    if(/\bsecurity\s+definer\b/i.test(sql))riskTags.push('security_definer');
    if(/\b(?:transfer|donation|spend|award)\b/i.test(filename))riskTags.push('economic_policy');
    manifest.push({filename,name:filename.replace(/^[0-9]{14}_/,'').replace(/\.sql$/,''),
      sha256:sha256(sql),bytes:Buffer.byteLength(sql),risk_tags:riskTags});
  }
  return {files:manifest,manifest_sha256:sha256(manifest.map(x=>x.filename+' '+x.sha256).join('\n'))};
}

export function backupInventory(data,{now=new Date()}={}){
  if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.backups))
    throw new Error('unrecognized_supabase_backup_inventory');
  const nowMs=now.getTime();
  if(!Number.isFinite(nowMs))throw new Error('invalid_clock');
  const completed=data.backups.filter(x=>x?.status==='COMPLETED'&&
    Number.isFinite(Date.parse(x.inserted_at)) &&
    Date.parse(x.inserted_at)<=nowMs &&
    Date.parse(x.inserted_at)>=nowMs-MAX_BACKUP_AGE_HOURS*3600_000);
  const latest=completed.reduce((acc,x)=>Math.max(acc,Date.parse(x.inserted_at)),0);
  const physical=Number(data.physical_backup_data?.latest_physical_backup_date_unix);
  const pitrRecent=data.pitr_enabled===true&&Number.isFinite(physical)&&physical>0&&
    physical*1000<=nowMs&&physical*1000>=nowMs-MAX_BACKUP_AGE_HOURS*3600_000;
  return {
    inventory_status:(completed.length>0||pitrRecent)?'recent_backup_visible':'missing_or_stale_backup',
    recent_completed_backups:completed.length,
    latest_completed_backup_utc:latest?new Date(latest).toISOString():null,
    pitr_enabled:data.pitr_enabled===true,
    recent_pitr_checkpoint_visible:pitrRecent,
    // A listed backup is not a verified restore. Authorization remains human-owned.
    restore_test_verified:false,
  };
}
export async function inspectProduction({token,fetchImpl=fetch,readinessInspect=inspect,manifestFn=migrationManifest,now=new Date()}){
  if(!token)throw new Error('management_credential_required');
  const manifest=await manifestFn();
  const readiness=await readinessInspect({environment:'production',token,fetchImpl});
  if(readiness.project_ref!==PROJECTS.production||
     !Array.isArray(readiness.missing_migrations)||
     readiness.migration_count_expected!==manifest.files.length)
    throw new Error('points_release_source_environment_mismatch');
  const response=await fetchImpl(
    'https://api.supabase.com/v1/projects/'+PROJECTS.production+'/database/backups',{
      method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(15000),
    });
  if(!response.ok)throw new Error('production_backup_inventory_unavailable:'+response.status);
  const backup=backupInventory(await response.json(),{now});
  const posture=readiness.state==='points_not_installed'?'not_installed':
    readiness.state==='technically_ready_for_policy_review'?'technical_review_required':
    'other_state_requires_manual_review';
  return {
    project_ref:PROJECTS.production,
    schema_posture:posture,
    prerequisites_ok:readiness.prerequisites_ok,
    missing_migration_count:readiness.missing_migrations.length,
    source_manifest_sha256:manifest.manifest_sha256,
    source_migrations:manifest.files,
    backup,
    backup_restore_owner_approval_required:true,
    production_schema_write_authorized:false,
    production_points_activation_authorized:false,
    // All reports intentionally exclude backup identifiers, API secrets, and SQL.
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await inspectProduction({token:process.env.SUPABASE_ACCESS_TOKEN});
    console.log(JSON.stringify(result,null,2));
    if(process.argv.includes('--require-recent-backup')&&
       result.backup.inventory_status!=='recent_backup_visible')process.exitCode=1;
  }catch(error){
    console.error('EKODI_POINTS_SCHEMA_PLAN_BLOCKED:'+String(error?.message||error));
    process.exitCode=2;
  }
}
