import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { assertProductionAccountBoundary } from './cloudflare-quota-guard-lib.mjs';

const SUPABASE_API='https://api.supabase.com/v1';
const GITHUB_API='https://api.github.com';
const DEFAULT_SUPABASE_OIDC_CONFIG='config/free-tier-supabase-oidc.json';
const DEFAULT_CLOUDFLARE_QUOTA_CONFIG='config/cloudflare-production-quota-guard.json';
const CLOUDFLARE_GRAPHQL='https://api.cloudflare.com/client/v4/graphql';
const GB=1024*1024*1024;

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

export async function collectSupabase({token,fetchJson=jsonFetch,observedAt=nowIso()}={}){
  if(!token)return {available:false,reason:'credential_missing',snapshots:[],freeOrganizations:[],activeProjects:[]};
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
      const result=await fetchJson(`${SUPABASE_API}/projects/${encodeURIComponent(ref)}/database/query/read-only`,{
        token,method:'POST',body:{query:`select
          pg_catalog.pg_database_size(pg_catalog.current_database())::bigint as database_bytes,
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
        observedValue:databaseBytes,freeLimit:500*1024*1024,source:'supabase-database-read-only-query',observedAt
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
      observedValue:bytes,freeLimit:GB,source:'supabase-database-read-only-query',observedAt
    });
  }
  return {available:true,reason:null,snapshots,freeOrganizations:freeOrganizations.map(org=>({id:String(org.id),plan:'free'})),activeProjects:activeProjects.map(p=>String(p.ref||p.id||''))};
}

export async function loadSupabaseOidcConfig(path=DEFAULT_SUPABASE_OIDC_CONFIG){
  const raw=await fs.readFile(path,'utf8');
  const parsed=JSON.parse(raw);
  if(!parsed||!Array.isArray(parsed.projects)||!parsed.projects.length)throw new Error('SUPABASE_OIDC_CONFIG_INVALID');
  return parsed;
}

export async function collectSupabaseOidc({token,config,fetchJson=jsonFetch,observedAt=nowIso()}={}){
  if(!token)return {available:false,reason:'oidc_token_missing',mode:'github_oidc',snapshots:[],projects:[],errors:[]};
  if(!config||!Array.isArray(config.projects))throw new Error('SUPABASE_OIDC_CONFIG_REQUIRED');
  const snapshots=[];
  const projects=[];
  const errors=[];
  const storageByProject=new Map();
  for(const project of config.projects){
    const ref=String(project?.ref||'').trim();
    const endpoint=String(project?.usageEndpoint||'').trim();
    if(!ref||!endpoint)continue;
    try{
      const data=await fetchJson(endpoint,{token});
      const databaseBytes=Number(data?.database_bytes);
      const storageBytes=Number(data?.storage_object_bytes);
      if(!Number.isFinite(databaseBytes))throw new Error('DATABASE_BYTES_INVALID');
      snapshots.push({
        provider:'supabase',metric:`database_bytes:${ref}`,periodStart:periodDay(observedAt),
        observedValue:databaseBytes,freeLimit:500*1024*1024,source:'supabase-edge-github-oidc',observedAt
      });
      if(Number.isFinite(storageBytes)){
        snapshots.push({
          provider:'supabase',metric:`storage_object_bytes:${ref}`,periodStart:periodDay(observedAt),
          observedValue:storageBytes,freeLimit:null,source:'supabase-edge-github-oidc',observedAt
        });
        storageByProject.set(ref,storageBytes);
      }
      projects.push(ref);
    }catch(error){
      errors.push({ref,error:error?.message||String(error)});
    }
  }
  const configuredProjects=config.projects.filter(project=>String(project?.ref||'').trim()&&String(project?.usageEndpoint||'').trim());
  const capacityPolicy=config.capacityPolicy||{};
  const requireAll=capacityPolicy.requireAllConfiguredProjectsMeasured!==false;
  const completeMeasurement=configuredProjects.length>0
    && projects.length===configuredProjects.length
    && errors.length===0;
  if((!requireAll&&projects.length>0)||completeMeasurement){
    const freeLimit=Number(capacityPolicy.freeActiveProjectLimit);
    if(Number.isFinite(freeLimit)&&freeLimit>0){
      snapshots.push({
        provider:'supabase',metric:'active_projects',periodStart:periodDay(observedAt),
        observedValue:projects.length,freeLimit,source:'supabase-edge-github-oidc',observedAt
      });
    }
    if(storageByProject.size===projects.length){
      const totalStorage=[...storageByProject.values()].reduce((sum,value)=>sum+value,0);
      const metricKey=String(capacityPolicy.organizationMetricKey||'oidc-config').replace(/[^a-z0-9_-]/gi,'-').slice(0,80)||'oidc-config';
      snapshots.push({
        provider:'supabase',metric:`storage_bytes_org:${metricKey}`,periodStart:periodMonth(observedAt),
        observedValue:totalStorage,freeLimit:GB,source:'supabase-edge-github-oidc',observedAt
      });
    }
  }
  return {
    available:projects.length>0,
    reason:projects.length===0?'oidc_endpoint_unavailable':errors.length?'partial':null,
    mode:'github_oidc',
    capacityMeasured:completeMeasurement,
    snapshots,projects,errors
  };
}

export async function loadCloudflareQuotaConfig(path=DEFAULT_CLOUDFLARE_QUOTA_CONFIG){
  const raw=await fs.readFile(path,'utf8');
  const parsed=JSON.parse(raw);
  if(!parsed||!Number.isFinite(Number(parsed.dailyRequestLimit))||Number(parsed.dailyRequestLimit)<=0)throw new Error('CLOUDFLARE_QUOTA_CONFIG_INVALID');
  return parsed;
}

export async function collectCloudflare({token,accountId,developmentAccountId='',config,fetchJson=jsonFetch,observedAt=nowIso()}={}){
  if(!token)return {available:false,reason:'credential_missing',snapshots:[]};
  if(!accountId)return {available:false,reason:'account_missing',snapshots:[]};
  if(!config)throw new Error('CLOUDFLARE_QUOTA_CONFIG_REQUIRED');
  assertProductionAccountBoundary({
    productionAccountId:accountId,
    developmentAccountId,
    knownDevelopmentAccountIds:config.knownDevelopmentAccountIds||[],
  });
  const end=new Date(observedAt);
  if(!Number.isFinite(end.getTime()))throw new Error('CLOUDFLARE_OBSERVED_AT_INVALID');
  const start=new Date(end);
  start.setUTCHours(0,0,0,0);
  const query=`query Usage($accountTag: string, $start: string, $end: string) {
    viewer {
      accounts(filter:{accountTag:$accountTag}) {
        workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:$start, datetime_leq:$end}) {
          sum { requests }
        }
      }
    }
  }`;
  const payload=await fetchJson(CLOUDFLARE_GRAPHQL,{
    token,
    method:'POST',
    body:{query,variables:{accountTag:accountId,start:start.toISOString(),end:end.toISOString()}},
  });
  if(Array.isArray(payload?.errors)&&payload.errors.length){
    throw new Error(`CLOUDFLARE_GRAPHQL_ERROR:${String(payload.errors[0]?.message||'unknown')}`);
  }
  const rows=payload?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive||[];
  const requests=rows.reduce((sum,row)=>sum+Number(row?.sum?.requests||0),0);
  if(!Number.isFinite(requests)||requests<0)throw new Error('CLOUDFLARE_REQUESTS_INVALID');
  const freeLimit=Number(config.dailyRequestLimit);
  return {
    available:true,
    reason:null,
    snapshots:[{
      provider:'cloudflare',
      metric:'workers_requests_daily',
      periodStart:periodDay(observedAt),
      observedValue:requests,
      freeLimit,
      source:'cloudflare-workers-analytics',
      observedAt,
    }],
    window:{start:start.toISOString(),end:end.toISOString()},
  };
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
  const githubPromise=collectGitHub({repository:env.GITHUB_REPOSITORY,token:env.GITHUB_TOKEN||'',observedAt});
  const cloudflarePromise=(env.CLOUDFLARE_API_TOKEN&&env.CLOUDFLARE_ACCOUNT_ID)
    ? loadCloudflareQuotaConfig(env.CLOUDFLARE_QUOTA_CONFIG||DEFAULT_CLOUDFLARE_QUOTA_CONFIG)
        .then(config=>collectCloudflare({
          token:env.CLOUDFLARE_API_TOKEN,
          accountId:env.CLOUDFLARE_ACCOUNT_ID,
          developmentAccountId:env.CLOUDFLARE_DEVELOPMENT_ACCOUNT_ID||'',
          config,
          observedAt,
        }))
    : Promise.resolve({available:false,reason:'credential_missing',snapshots:[]});
  let supabasePromise;
  if(env.SUPABASE_ACCESS_TOKEN){
    supabasePromise=collectSupabase({token:env.SUPABASE_ACCESS_TOKEN,observedAt}).then(result=>({...result,mode:'management_api'}));
  }else if(env.SUPABASE_OIDC_TOKEN){
    supabasePromise=loadSupabaseOidcConfig(env.SUPABASE_OIDC_CONFIG||DEFAULT_SUPABASE_OIDC_CONFIG)
      .then(config=>collectSupabaseOidc({token:env.SUPABASE_OIDC_TOKEN,config,observedAt}));
  }else{
    supabasePromise=Promise.resolve({available:false,reason:'credential_missing',mode:'none',snapshots:[],freeOrganizations:[],activeProjects:[],projects:[],errors:[]});
  }
  const [supabase,github,cloudflare]=await Promise.all([supabasePromise,githubPromise,cloudflarePromise]);
  return {observedAt,supabase,github,cloudflare,snapshots:[...cloudflare.snapshots,...supabase.snapshots,...github.snapshots]};
}

async function main(){
  const output=process.argv[2];
  if(!output)throw new Error('OUTPUT_SQL_PATH_REQUIRED');
  const result=await collectAll();
  await fs.writeFile(output,snapshotsToSql(result.snapshots)+'\n','utf8');
  process.stdout.write(JSON.stringify({
    observedAt:result.observedAt,
    supabase:{available:result.supabase.available,reason:result.supabase.reason,mode:result.supabase.mode||'management_api',freeOrganizations:(result.supabase.freeOrganizations||[]).length,activeProjects:(result.supabase.activeProjects||[]).length,projects:(result.supabase.projects||[]).length,snapshots:result.supabase.snapshots.length},
    cloudflare:{available:result.cloudflare.available,reason:result.cloudflare.reason,snapshots:result.cloudflare.snapshots.length},
    github:{repository:result.github.repository,snapshots:result.github.snapshots.length},
  })+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error('[free-tier-resource-collector]',error?.message||error);process.exitCode=1});
}
