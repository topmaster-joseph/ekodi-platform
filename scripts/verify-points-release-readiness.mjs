#!/usr/bin/env node
// EKODI Points release preflight — READ ONLY. Never applies SQL, deploys a
// function or flips POINTS_ENABLED. Fail closed on API/contract uncertainty.
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const PROJECTS=Object.freeze({
  development:'lxcxwbdwwojjkgybbqii',
  production:'renzehysxirjilvdxacv',
});
export const PREREQUISITES=Object.freeze([
  'people','login_identities','tenants','auth_users','auth_uid','activity_context',
]);
export const POINTS_CONTRACT=Object.freeze([
  'points_sites','points_rules','points_ledger','points_claims','recognition_goals',
  'recognition_read_rpc','recognition_write_rpc','anon_goals_denied','direct_goals_denied',
  'points_tables_secure',
]);

export const SCHEMA_QUERY=String.raw`select
  (to_regclass('public.people') is not null) as people,
  (to_regclass('public.login_identities') is not null) as login_identities,
  (to_regclass('public.tenants') is not null) as tenants,
  (to_regclass('auth.users') is not null) as auth_users,
  (to_regprocedure('auth.uid()') is not null) as auth_uid,
  (to_regprocedure('public.current_site_activity_contexts()') is not null) as activity_context,
  (to_regclass('public.ekodi_point_sites') is not null) as points_sites,
  (to_regclass('public.ekodi_point_rules') is not null) as points_rules,
  (to_regclass('public.ekodi_point_ledger') is not null) as points_ledger,
  (to_regclass('public.ekodi_point_evidence_claims') is not null) as points_claims,
  (to_regclass('ekodi_points_private.member_recognition_goals') is not null) as recognition_goals,
  (to_regprocedure('public.ekodi_points_my_recognition_goal(text)') is not null) as recognition_read_rpc,
  (to_regprocedure('public.ekodi_points_set_recognition_goal(text,integer,integer)') is not null) as recognition_write_rpc,
  case when to_regprocedure('public.ekodi_points_my_recognition_goal(text)') is not null
    then not has_function_privilege('anon',to_regprocedure('public.ekodi_points_my_recognition_goal(text)'),'execute')
    else false end as anon_goals_denied,
  case when to_regclass('ekodi_points_private.member_recognition_goals') is not null
    then not has_table_privilege('authenticated',to_regclass('ekodi_points_private.member_recognition_goals'),'select')
    else false end as direct_goals_denied,
  -- Fail closed if any points-owned table loses RLS or grants direct browser writes.
  (select count(*)>0 and coalesce(bool_and(
      c.relrowsecurity
      and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')
    ),false)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p')
      and ((n.nspname='public' and c.relname like 'ekodi_point_%')
        or n.nspname='ekodi_points_private')
  ) as points_tables_secure`;
export const MIGRATION_QUERY=String.raw`select version,name
  from supabase_migrations.schema_migrations
  where name like '%_ekodi_points_%'
     or name like '%_ekodi_site_activity_points_%'
     or name like 'ekodi_points_%'
     or name like 'ekodi_site_activity_points_%'
  order by version`;

export function pointMigrations(files) {
  return files.filter(name=>/^[0-9]{14}_ekodi_(?:site_activity_points|points)_.*\.sql$/.test(name))
    .sort().map(name=>name.replace(/^[0-9]{14}_/,'').replace(/\.sql$/,''));
}
export function migrationName(row) {
  const value=String(row?.name||'');
  return value.replace(/^[0-9]{14}_/,'').replace(/\.sql$/,'');
}
export function assess({schema,migrations,functions,expected}){
  if(!schema||typeof schema!=='object'||Array.isArray(schema)||
     !Array.isArray(migrations)||!Array.isArray(functions)||!Array.isArray(expected)||!expected.length)
    throw new Error('points_readiness_invalid_response');
  const missingPrerequisites=PREREQUISITES.filter(key=>schema[key]!==true);
  const missingContracts=POINTS_CONTRACT.filter(key=>schema[key]!==true);
  const installed=new Set(migrations.map(migrationName));
  const missingMigrations=expected.filter(name=>!installed.has(name));
  const recognized=expected.length-missingMigrations.length;
  const api=functions.find(f=>f?.slug==='points-api');
  const apiReady=api?.status==='ACTIVE'&&api?.verify_jwt===true;
  let state='schema_incomplete';
  if(missingPrerequisites.length)state='prerequisites_missing';
  else if(recognized===0)state='points_not_installed';
  else if(missingMigrations.length)state='points_partially_installed';
  else if(missingContracts.length||!apiReady)state='points_contract_incomplete';
  else state='technically_ready_for_policy_review';
  return {
    state,
    prerequisites_ok:missingPrerequisites.length===0,
    migration_count_expected:expected.length,
    migration_count_recognized:recognized,
    missing_prerequisites:missingPrerequisites,
    missing_migrations:missingMigrations,
    missing_contracts:missingContracts,
    points_api:{deployed:Boolean(api),active:api?.status==='ACTIVE',jwt_verified:api?.verify_jwt===true},
    // Financial/site-operator activation is never decided by this preflight.
    points_activation_authorized:false,
  };
}

async function apiJson(url,token,{method='GET',query,fetchImpl=fetch}={}){
  const response=await fetchImpl(url,{
    method,headers:{authorization:'Bearer '+token,accept:'application/json',
      ...(query?{'content-type':'application/json'}:{})},
    ...(query?{body:JSON.stringify({query})}:{}),
    redirect:'error',
    signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw new Error('management_read_failed:'+response.status);
  return response.json();
}
export async function inspect({environment,token,fetchImpl=fetch,files}){
  const ref=PROJECTS[environment];
  if(!ref)throw new Error('invalid_points_environment');
  if(!token)throw new Error('management_credential_required');
  const expected=pointMigrations(files||readdirSync(new URL('../supabase/migrations/',import.meta.url)));
  if(expected.length<20)throw new Error('points_migration_catalog_incomplete');
  const base='https://api.supabase.com/v1/projects/'+ref;
  const [schemaRows,migrationRows,functions]=await Promise.all([
    apiJson(base+'/database/query/read-only',token,{method:'POST',query:SCHEMA_QUERY,fetchImpl}),
    apiJson(base+'/database/query/read-only',token,{method:'POST',query:MIGRATION_QUERY,fetchImpl}),
    apiJson(base+'/functions',token,{fetchImpl}),
  ]);
  if(!Array.isArray(schemaRows)||schemaRows.length!==1||!Array.isArray(migrationRows)||
     !Array.isArray(functions))throw new Error('points_readiness_unexpected_result');
  return {environment,project_ref:ref,...assess({
    schema:schemaRows[0],migrations:migrationRows,functions,expected,
  })};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const env=process.argv.includes('--production')?'production':
    process.argv.includes('--development')?'development':null;
  const reportMode=process.argv.includes('--report');
  if(!env){console.error('Choose --production or --development (read-only).');process.exit(2);}
  try{
    const report=await inspect({environment:env,token:process.env.SUPABASE_ACCESS_TOKEN});
    console.log(JSON.stringify(report,null,2));
    if(!reportMode&&report.state!=='technically_ready_for_policy_review')process.exitCode=1;
  }catch(error){
    console.error('EKODI_POINTS_READINESS_FAILED:'+String(error?.message||error));
    process.exitCode=2;
  }
}
