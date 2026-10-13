import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_PROJECTS=Object.freeze({
  prod:'renzehysxirjilvdxacv',
  dev:'lxcxwbdwwojjkgybbqii'
});
export const TABLE_KEYS=Object.freeze([
  'tenants','people','activities','activity_media_links','activity_public_shares','activity_participations'
]);
export const FUNCTION_KEYS=Object.freeze([
  'media_link','reserve_upload','finalize_upload','admin_hide','archive_snapshot'
]);
export const PROOF_SQL=String.raw`select
  to_regclass('public.tenants') is not null as tenants,
  to_regclass('public.people') is not null as people,
  to_regclass('public.activities') is not null as activities,
  to_regclass('public.activity_media_links') is not null as activity_media_links,
  to_regclass('public.activity_public_shares') is not null as activity_public_shares,
  to_regclass('public.activity_participations') is not null as activity_participations,
  to_regprocedure('public.activity_public_submit_media_link(text,text,text,text,text,text,text,text)') is not null as media_link,
  to_regprocedure('public.activity_public_reserve_media_upload(text,text,text,text,text,text,bigint,text,text)') is not null as reserve_upload,
  to_regprocedure('public.activity_public_finalize_media_upload(text,text,uuid,text,text)') is not null as finalize_upload,
  to_regprocedure('public.activity_admin_hide_media_link(text,text,uuid,boolean)') is not null as admin_hide,
  to_regprocedure('public.activity_public_archive_snapshot(text,text)') is not null as archive_snapshot,
  coalesce((select position('media_moderated' in lower(pg_get_functiondef(p.oid)))>0 and
    position('hidden_at is null' in lower(pg_get_functiondef(p.oid)))>0
    from pg_proc p where p.oid=to_regprocedure('public.activity_public_submit_media_link(text,text,text,text,text,text,text,text)')),false) as link_moderation_guard,
  coalesce((select position('media_moderated' in lower(pg_get_functiondef(p.oid)))>0 and
    position('hidden_at is null' in lower(pg_get_functiondef(p.oid)))>0
    from pg_proc p where p.oid=to_regprocedure('public.activity_public_reserve_media_upload(text,text,text,text,text,text,bigint,text,text)')),false) as reservation_moderation_guard,
  coalesce((select position('and hidden_at is null' in lower(pg_get_functiondef(p.oid)))>0
    from pg_proc p where p.oid=to_regprocedure('public.activity_public_finalize_media_upload(text,text,uuid,text,text)')),false) as finalize_moderation_guard,
  coalesce((select has_function_privilege('anon',p.oid,'EXECUTE')
    from pg_proc p where p.oid=to_regprocedure('public.activity_public_submit_media_link(text,text,text,text,text,text,text,text)')),false) as anon_submit_rpc,
  coalesce((select has_function_privilege('anon',p.oid,'EXECUTE')
    from pg_proc p where p.oid=to_regprocedure('public.activity_public_reserve_media_upload(text,text,text,text,text,text,bigint,text,text)')),false) as anon_reserve_rpc,
  case when to_regclass('public.activity_media_links') is not null then
     not has_table_privilege('anon', 'public.activity_media_links','SELECT')
     and not has_table_privilege('anon', 'public.activity_media_links','INSERT')
     and not has_table_privilege('anon', 'public.activity_media_links','UPDATE')
     and not has_table_privilege('anon', 'public.activity_media_links','DELETE')
  else false end as media_table_private
`;

export const FIELD_KEYS=Object.freeze([
  ...TABLE_KEYS,...FUNCTION_KEYS,
  'link_moderation_guard','reservation_moderation_guard','finalize_moderation_guard',
  'anon_submit_rpc','anon_reserve_rpc','media_table_private'
]);
const bools=values=>Object.fromEntries(FIELD_KEYS.map(k=>[k,values[k]===true]));

export function sanitizeRows(rows){
  if(!Array.isArray(rows)||rows.length!==1||!rows[0]||typeof rows[0]!=='object')
    throw new Error('Mission catalog proof must return exactly one structured row');
  for(const key of FIELD_KEYS)if(typeof rows[0][key]!=='boolean')
    throw new Error('Mission catalog proof field missing/invalid: '+key);
  return bools(rows[0]);
}
export function compare(production,development,generatedAt=new Date().toISOString()){
  const prod=bools(production),dev=bools(development);
  const missingInDev=[...TABLE_KEYS,...FUNCTION_KEYS].filter(key=>prod[key]&&!dev[key]);
  const guardKeys=['link_moderation_guard','reservation_moderation_guard',
    'finalize_moderation_guard','anon_submit_rpc','anon_reserve_rpc','media_table_private'];
  const prodSecure=guardKeys.every(key=>prod[key]===true);
  const devParity=missingInDev.length===0 && guardKeys.every(key=>dev[key]===prod[key]);
  return {
    schemaVersion:1,generatedAt,kind:'EKODI_MISSION_CATALOG_ONLY',
    source:'Supabase management SQL read_only=true; pg_catalog metadata; no customer rows',
    production:prod,development:dev,
    missingInDev,productionGuardVerified:prodSecure,developmentParity:devParity,
    disposition:!prodSecure?'PRODUCTION_GUARD_FAILED':!devParity?'DEVELOPMENT_SCHEMA_DRIFT':'PARITY_VERIFIED'
  };
}
export async function queryCatalog({fetchImpl=fetch,token,projectRef}){
  if(!token||typeof token!=='string')throw new Error('SUPABASE_ACCESS_TOKEN missing (no fallback)');
  if(!/^[a-z0-9]{20}$/.test(projectRef))throw new Error('Project ref invalid');
  const res=await fetchImpl('https://api.supabase.com/v1/projects/'+projectRef+'/database/query',{
    method:'POST',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({query:PROOF_SQL,read_only:true}),
    signal:AbortSignal.timeout(20000)
  });
  if(res.status!==201)throw new Error('Read-only catalog query failed HTTP '+res.status);
  const result=await res.json();
  return sanitizeRows(result);
}
export async function run({env=process.env,fetchImpl=fetch,outputDir='artifacts/mission-schema-parity',clock=()=>new Date()}={}){
  const token=env.SUPABASE_ACCESS_TOKEN;
  if(!token)throw new Error('SUPABASE_ACCESS_TOKEN missing (no fallback)');
  const devRef=env.EKODI_DEV_PROJECT_REF||DEFAULT_PROJECTS.dev;
  const prodRef=env.EKODI_PROD_PROJECT_REF||DEFAULT_PROJECTS.prod;
  if(devRef===prodRef)throw new Error('DEV and PROD project refs must differ');
  const [dev,prod]=await Promise.all([
    queryCatalog({fetchImpl,token,projectRef:devRef}),
    queryCatalog({fetchImpl,token,projectRef:prodRef})
  ]);
  const report=compare(prod,dev,clock().toISOString());
  await fs.mkdir(outputDir,{recursive:true});
  await fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const report=await run();
    console.log(JSON.stringify({disposition:report.disposition,productionGuardVerified:report.productionGuardVerified,
      developmentParity:report.developmentParity,missingInDev:report.missingInDev,reportFile:'artifacts/mission-schema-parity/report.json'}));
    if(report.disposition!=='PARITY_VERIFIED')process.exitCode=2;
  }catch(err){
    // Do not print response bodies, SQL error text or secrets.
    console.error('EKODI Mission schema audit failed closed: '+String(err.message||'unknown').slice(0,170));
    process.exitCode=1;
  }
}
