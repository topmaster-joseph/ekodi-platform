import { DISCOVERY_ORIGIN, DISCOVERY_PUBLIC_ROUTES, canonicalUrl } from './discovery-layer.js';
import { listSitePublicationSettings } from './site-publication-runtime.js';
import { fetchPublicDiscoveryRecords } from './public-discovery-runtime.js';

export const EKODI_PUBLIC_REGISTRY_PATH='/public-registry.json';
export const EKODI_PUBLIC_REGISTRY_POLICY='EKODI-PUBLIC-DISCOVERY-001';

const BLOCKED_PREFIXES=Object.freeze([
  '/admin','/api','/auth','/oauth','/my','/workspace-admin','/preview','/_ekodi'
]);

function normalizePath(value='/'){
  const raw=String(value||'/').split('?')[0].split('#')[0]||'/';
  const path=('/'+raw.replace(/^\/+|\/+$/g,'')).replace(/\/{2,}/g,'/');
  return path==='/'?'/':path.replace(/\/$/,'');
}

export function isPublicDiscoveryPath(pathname='/'){
  const path=normalizePath(pathname).toLowerCase();
  if(BLOCKED_PREFIXES.some(prefix=>path===prefix||path.startsWith(prefix+'/')))return false;
  if(path.split('/').includes('admin'))return false;
  return true;
}

function normalizeCanonical(value,pathFallback='/'){
  try{
    const url=new URL(String(value||canonicalUrl(pathFallback,DISCOVERY_ORIGIN)));
    if(url.protocol!=='https:'||url.hostname!=='ekodi.kr')return null;
    url.username='';url.password='';url.port='';url.search='';url.hash='';
    url.pathname=normalizePath(url.pathname);
    if(!isPublicDiscoveryPath(url.pathname))return null;
    return url.toString().replace(/\/$/,'')+(url.pathname==='/'?'/':'');
  }catch{return null}
}

function entryFromRoute(route){
  const url=normalizeCanonical(canonicalUrl(route.path),route.path);
  if(!url)return null;
  return Object.freeze({
    id:`route:${route.path}`,
    type:'page',
    name:route.label||route.title||route.path,
    url,
    path:normalizePath(route.path),
    description:route.description||'',
    changefreq:route.changefreq||'weekly',
    priority:route.priority||'0.5',
    source:'discovery-layer',
  });
}

function entryFromRuntimeRecord(record){
  const url=normalizeCanonical(record?.canonical_url);
  if(!url)return null;
  return Object.freeze({
    id:`registry:${record.source_type||'resource'}:${record.source_key||url}`,
    type:record.source_type||'resource',
    name:record.title||url,
    url,
    path:normalizePath(new URL(url).pathname),
    description:record.description||'',
    schemaType:record.schema_type||'WebPage',
    language:record.language||'ko',
    imageUrl:record.image_url||'',
    changefreq:['event','product'].includes(record.source_type)?'daily':'weekly',
    priority:record.source_type==='site'?'0.8':'0.7',
    source:'supabase-public-discovery-registry',
    updatedAt:record.modified_at||'',
  });
}

function entryFromSite(site){
  if(site?.publicStatus!=='public')return null;
  const url=normalizeCanonical(site.canonicalUrl,site.canonicalPath);
  if(!url)return null;
  return Object.freeze({
    id:`site:${site.id}`,
    type:'site',
    name:site.name||site.id,
    url,
    path:normalizePath(new URL(url).pathname),
    description:'',
    changefreq:'daily',
    priority:'0.8',
    source:site.source||'site-publication',
    updatedAt:site.updatedAt||'',
  });
}

export async function buildEkodiPublicRegistry(env){
  const [settings, runtimeRecords]=await Promise.all([listSitePublicationSettings(env),fetchPublicDiscoveryRecords(env)]);
  const publicationByPath=new Map(settings.map(site=>[normalizePath(site.canonicalPath),site]));
  const entries=new Map();

  for(const route of DISCOVERY_PUBLIC_ROUTES){
    const publication=publicationByPath.get(normalizePath(route.path));
    if(publication&&publication.publicStatus!=='public')continue;
    const entry=entryFromRoute(route);
    if(entry)entries.set(entry.url,entry);
  }
  for(const site of settings){
    const entry=entryFromSite(site);
    if(entry)entries.set(entry.url,entry);
  }
  for(const record of runtimeRecords){
    const entry=entryFromRuntimeRecord(record);
    if(entry)entries.set(entry.url,entry);
  }

  const resources=[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path,'ko'));
  return Object.freeze({
    schemaVersion:1,
    policy:EKODI_PUBLIC_REGISTRY_POLICY,
    canonicalHost:'ekodi.kr',
    generatedAt:new Date().toISOString(),
    sitemapUrl:'https://ekodi.kr/sitemap.xml',
    rules:Object.freeze({
      sourceOfTruth:'central Public Registry + public_site_controls + canonical service registries',
      include:'public only',
      exclude:Object.freeze(['private','maintenance','admin','auth','oauth','api','personal/private workspace','preview']),
    }),
    count:resources.length,
    resources:Object.freeze(resources),
    urls:Object.freeze(resources.map(resource=>resource.url)),
  });
}

export async function ekodiPublicRegistryResponse(env,{head=false}={}){
  const registry=await buildEkodiPublicRegistry(env);
  return new Response(head?null:JSON.stringify(registry,null,2),{
    status:200,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'public, max-age=60, stale-while-revalidate=300',
      'x-content-type-options':'nosniff',
      'x-ekodi-route':'public-discovery-registry',
    },
  });
}
