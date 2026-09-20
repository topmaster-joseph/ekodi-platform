import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SUPABASE_API='https://api.supabase.com/v1';
const GITHUB_API='https://api.github.com';
const GB=1024*1024*1024;

export const SUPABASE_PUBLIC_TELEMETRY_PROJECTS=Object.freeze([
  Object.freeze({
    ref:'renzehysxirjilvdxacv',
    publishableKey:'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_',
    group:'ekodi-free',
  }),
  Object.freeze({
    ref:'lxcxwbdwwojjkgybbqii',
    publishableKey:'sb_publishable_SyaM4rBxa1JdE9arZrhULg_z1BIQRXL',
    group:'ekodi-free',
  }),
]);

function sqlString(value){return `'${String(value??'').replaceAll("'","''")}'`}
function nowIso(){return new Date().toISOString()}
function periodDay(iso){return String(iso).slice(0,10)}
function periodMonth(iso){return String(iso).slice(0,7)}

async function jsonFetch(url,{token='',method='GET',body,headers={}}={}){
  const response=await fetch(url,{
    method,
    headers:{
      accept:'application/json',
      ...(token?{authorization:`Bearer ${token}`}:{}),
      ...(body?{'content-type':'application/json'}:{}),
      ...headers,
    },
    body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(20000),
  });
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=null}
  if(!response.ok){
    const error=new Error(`HTTP_${response.status}`);
    error.status=response.status;
    error.payload=data;
    throw error;
  }
  return data;
}

function rowsFromResult(data){
  if(Array.isArray(data))return data;
  if(Array.isArray(data?.result))return data.result;
  if(Array.isArray(data?.data))return data.data;
  return [];
}

async function collectSupabaseManagement({token,fetchJson,observedAt}){
  const [organizationsRaw,projectsRaw]=await Promise.all([
    fetchJson(`${SUPABASE_API}/organizations`,{token}),
    fetchJson(`${SUPABASE_API}/projects`,{token}),
  ]);
  const organizations=Array.isArray(organizationsRaw)?organizationsRaw:(organizationsRaw?.organizations||[]);
  const projects=Array.isArray(projectsRaw)?projectsRaw:(projectsRaw?.projects||[]);
  const freeOrganizations=[];
  for(const org of organizations){
    const id=String(org?.id||org?.slug||'');
    if(!id)continue;
    let detail=org;
    if(!String(org?.plan||'')){
      detail=await fetchJson(`${SUPABASE_API}/organizations/${encodeURIComponent(id)}`,{token});
    }
    if(String(detail?.plan||'').toLowerCase()==='free')freeOrganizations.push({...detail,id});
  }
  const freeIds=new Set(freeOrganizations.map(org=>String(org.id)));
  const freeProjects=projects.filter(project=>freeIds.has(String(project?.organization_id||project?.organization_slug||'')));
  const activeProjects=freeProjects.filter(project=>String(project?.status||'').toUpperCase().startsWith('ACTIVE'));
  const snapshots=[{
    provider:'supabase',metric:'active_projects',periodStart:periodDay(observedAt),
    observedValue:activeProjects.length,freeLimit:2,source:'supabase-management-api',observedAt
  }];
  const storageByOrg=new Map();
  for(const project of activeProjects){
    const ref=String(project?.ref||project?.id||'');
    if(!ref)continue;
    let databaseBytes=null,storageBytes=null;
    try{
      const result=await fetchJson(`${SUPABASE_API}/projects/${encodeURIComponent(ref)}/database/query`,{
        token,method:'POST',body:{query:`select
          pg_database_size(current_database())::bigint as database_bytes,
          coalesce((select sum((metadata->>'size')::bigint) from storage.objects where metadata ? 'size'),0)::bigint as storage_object_bytes`}
      });
      const row=rowsFromResult(result)[0]||{};
      const db=Number(row.database_bytes);
      const storage=Number(row.storage_object_bytes);
      databaseBytes=Number.isFinite(db)?db:null;
      storageBytes=Number.isFinite(storage)?storage:null;
    }catch(error){
      if(![401,403,404].includes(Number(error?.status||0)))throw error;
    }
    if(databaseBytes!=null){
      snapshots.push({
        provider:'supabase',metric:`database_bytes:${ref}`,periodStart:periodDay(observedAt),
        observedValue:databaseBytes,freeLimit:500*1024*1024,source:'supabase-database-query',observedAt
      });
    }
    if(storageBytes!=null){
      const orgId=String(project?.organization_id||project?.organization_slug||'unknown');
      storageByOrg.set(orgId,(storageByOrg.get(orgId)||0)+storageBytes);
    }
  }
  for(const [orgId,bytes] of storageByOrg){
    snapshots.push({
      provider:'supabase',metric:`storage_bytes_org:${orgId}`,periodStart:periodMonth(observedAt),
      observedValue:bytes,freeLimit:GB,source:'supabase-database-query',observedAt
    });
  }
  return {
    available:true,reason:null,mode:'management-api',snapshots,
    freeOrganizations:freeOrganizations.map(org=>({id:String(org.id),plan:'free'})),
    activeProjects:activeProjects.map(p=>String(p.ref||p.id||'')),
  };
}

export async function collectSupabasePublicTelemetry({
  projects=SUPABASE_PUBLIC_TELEMETRY_PROJECTS,
  fetchJson=jsonFetch,
  observedAt=nowIso(),
}={}){
  const measured=[];
  for(const project of projects){
    try{
      const data=await fetchJson(`https://${project.ref}.supabase.co/functions/v1/ekodi-resource-telemetry`,{
        headers:{
          apikey:project.publishableKey,
          'user-agent':'ekodi-free-tier-governor/2',
        },
      });
      if(data?.ok!==true)throw new Error('TELEMETRY_NOT_OK');
      const databaseBytes=Number(data.database_bytes);
      const storageBytes=Number(data.storage_object_bytes);
      if(!Number.isFinite(databaseBytes)||!Number.isFinite(storageBytes))throw new Error('TELEMETRY_INVALID');
      measured.push({...project,databaseBytes,storageBytes});
    }catch{
      // Missing project telemetry must remain unknown; never fabricate a usage percentage.
    }
  }

  if(!measured.length){
    return {available:false,reason:'project_telemetry_unavailable',mode:'project-telemetry',snapshots:[],freeOrganizations:[],activeProjects:[]};
  }

  const snapshots=[];
  if(measured.length===projects.length){
    snapshots.push({
      provider:'supabase',metric:'active_projects',periodStart:periodDay(observedAt),
      observedValue:measured.length,freeLimit:2,source:'supabase-project-telemetry',observedAt
    });
  }

  const storageByGroup=new Map();
  for(const project of measured){
    snapshots.push({
      provider:'supabase',metric:`database_bytes:${project.ref}`,periodStart:periodDay(observedAt),
      observedValue:project.databaseBytes,freeLimit:500*1024*1024,source:'supabase-project-telemetry',observedAt
    });
    storageByGroup.set(project.group,(storageByGroup.get(project.group)||0)+project.storageBytes);
  }
  for(const [group,bytes] of storageByGroup){
    snapshots.push({
      provider:'supabase',metric:`storage_bytes_org:${group}`,periodStart:periodMonth(observedAt),
      observedValue:bytes,freeLimit:GB,source:'supabase-project-telemetry',observedAt
    });
  }
  return {
    available:true,
    reason:measured.length===projects.length?null:'partial_project_telemetry',
    mode:'project-telemetry',
    snapshots,
    freeOrganizations:[],
    activeProjects:measured.map(project=>project.ref),
  };
}

export async function collectSupabase({token,fetchJson=jsonFetch,observedAt=nowIso(),projects=SUPABASE_PUBLIC_TELEMETRY_PROJECTS}={}){
  if(token){
    try{
      return await collectSupabaseManagement({token,fetchJson,observedAt});
    }catch(error){
      if(![401,403].includes(Number(error?.status||0)))throw error;
    }
  }
  return collectSupabasePublicTelemetry({projects,fetchJson,observedAt});
}

export async function collectGitHub({repository,token='',fetchJson=jsonFetch,observedAt=nowIso()}={}){
  if(!repository||!repository.includes('/'))throw new Error('GITHUB_REPOSITORY_REQUIRED');
  const headers={'x-github-api-version':'2026-03-10','accept':'application/vnd.github+json'};
  const repo=await fetchJson(`${GITHUB_API}/repos/${repository}`,{token,headers});
  const cache=await fetchJson(`${GITHUB_API}/repos/${repository}/actions/cache/usage`,{token,headers});
  let artifactsBytes=0;
  for(let page=1;page<=10;page++){
    const data=await fetchJson(`${GITHUB_API}/repos/${repository}/actions/artifacts?per_page=100&page=${page}`,{token,headers});
    const artifacts=Array.isArray(data?.artifacts)?data.artifacts:[];
    for(const artifact of artifacts){
      if(artifact?.expired===true)continue;
      const size=Number(artifact?.size_in_bytes);
      if(Number.isFinite(size)&&size>0)artifactsBytes+=size;
    }
    if(artifacts.length<100)break;
  }
  const cacheBytes=Number(cache?.active_caches_size_in_bytes||0);
  return {
    repository:{fullName:repository,visibility:String(repo?.visibility||''),private:Boolean(repo?.private)},
    snapshots:[
      {provider:'github',metric:'cache_storage_bytes',periodStart:periodDay(observedAt),observedValue:Number.isFinite(cacheBytes)?cacheBytes:0,freeLimit:10*GB,source:'github-rest-cache-usage',observedAt},
      {provider:'github',metric:'artifact_storage_bytes',periodStart:periodDay(observedAt),observedValue:artifactsBytes,freeLimit:null,source:'github-rest-artifacts',observedAt},
    ],
  };
}

export function snapshotsToSql(snapshots){
  const lines=[];
  for(const row of snapshots){
    const percent=row.freeLimit&&row.freeLimit>0?(Number(row.observedValue)/Number(row.freeLimit))*100:null;
    lines.push(`INSERT INTO provider_quota_snapshots(provider,metric,period_start,observed_value,free_limit,usage_percent,source,observed_at)
VALUES(${sqlString(row.provider)},${sqlString(row.metric)},${sqlString(row.periodStart)},${Number(row.observedValue)||0},${row.freeLimit==null?'NULL':Number(row.freeLimit)},${percent==null?'NULL':percent},${sqlString(row.source)},${sqlString(row.observedAt)})
ON CONFLICT(provider,metric,period_start) DO UPDATE SET observed_value=excluded.observed_value,free_limit=excluded.free_limit,usage_percent=excluded.usage_percent,source=excluded.source,observed_at=excluded.observed_at;`);
  }
  return lines.join('\n');
}

export async function collectAll(env=process.env){
  const observedAt=nowIso();
  const [supabase,github]=await Promise.all([
    collectSupabase({token:env.SUPABASE_ACCESS_TOKEN,observedAt}),
    collectGitHub({repository:env.GITHUB_REPOSITORY,token:env.GITHUB_TOKEN||'',observedAt}),
  ]);
  return {observedAt,supabase,github,snapshots:[...supabase.snapshots,...github.snapshots]};
}

async function main(){
  const output=process.argv[2];
  if(!output)throw new Error('OUTPUT_SQL_PATH_REQUIRED');
  const result=await collectAll();
  await fs.writeFile(output,snapshotsToSql(result.snapshots)+'\n','utf8');
  process.stdout.write(JSON.stringify({
    observedAt:result.observedAt,
    supabase:{
      available:result.supabase.available,
      reason:result.supabase.reason,
      mode:result.supabase.mode,
      freeOrganizations:result.supabase.freeOrganizations.length,
      activeProjects:result.supabase.activeProjects.length,
      snapshots:result.supabase.snapshots.length,
    },
    github:{repository:result.github.repository,snapshots:result.github.snapshots.length},
  })+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error('[free-tier-resource-collector]',error?.message||error);process.exitCode=1});
}
