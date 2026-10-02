import { DISCOVERY_ORIGIN, DISCOVERY_PUBLIC_ROUTES, canonicalUrl } from './discovery-layer.js';
import { listSitePublicationSettings } from './site-publication-runtime.js';
import { collectPublicDiscoveryItems } from './public-discovery-content.js';

export const EKODI_PUBLIC_REGISTRY_PATH='/public-registry.json';
export const EKODI_PUBLIC_REGISTRY_POLICY='EKODI-PUBLIC-DISCOVERY-002';
export const EKODI_DYNAMIC_SITEMAP_PATH='/sitemap.xml';
export const EKODI_DYNAMIC_LLMS_PATH='/llms.txt';

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
  const settings=await listSitePublicationSettings(env);
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

  const publicationById=new Map(settings.map(site=>[String(site.id||''),site]));
  const contentItems=await collectPublicDiscoveryItems(env);
  for(const item of contentItems){
    const parent=publicationById.get(String(item.siteId||''));
    if(parent&&parent.publicStatus!=='public')continue;
    const url=normalizeCanonical(item.url,item.path);
    if(!url)continue;
    entries.set(url,Object.freeze({
      ...item,
      url,
      path:normalizePath(new URL(url).pathname),
      description:item.description||'',
      changefreq:item.changefreq||'weekly',
      priority:item.priority||'0.6',
    }));
  }

  const resources=[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path,'ko'));
  return Object.freeze({
    schemaVersion:1,
    policy:EKODI_PUBLIC_REGISTRY_POLICY,
    canonicalHost:'ekodi.kr',
    generatedAt:new Date().toISOString(),
    sitemapUrl:'https://ekodi.kr/sitemap.xml',
    rules:Object.freeze({
      sourceOfTruth:'public_site_controls + registered discovery routes + public_discovery_items + verified public source adapters',
      include:'public sites and public content only',
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


function xmlEscape(value=''){
  return String(value??'').replace(/[<>&"']/g,ch=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[ch]));
}

export async function ekodiDynamicSitemapResponse(env,{head=false}={}){
  const registry=await buildEkodiPublicRegistry(env);
  const urls=registry.resources.map(resource=>{
    const parts=['  <url>',`    <loc>${xmlEscape(resource.url)}</loc>`];
    if(resource.updatedAt||resource.publishedAt)parts.push(`    <lastmod>${xmlEscape(String(resource.updatedAt||resource.publishedAt).slice(0,10))}</lastmod>`);
    if(resource.changefreq)parts.push(`    <changefreq>${xmlEscape(resource.changefreq)}</changefreq>`);
    if(resource.priority)parts.push(`    <priority>${xmlEscape(resource.priority)}</priority>`);
    parts.push('  </url>');
    return parts.join('\n');
  }).join('\n');
  const body=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(head?null:body,{status:200,headers:{
    'content-type':'application/xml; charset=utf-8',
    'cache-control':'public, max-age=60, stale-while-revalidate=300',
    'x-content-type-options':'nosniff',
    'x-ekodi-route':'dynamic-public-sitemap',
  }});
}

export async function ekodiDynamicLlmsResponse(env,{head=false}={}){
  const registry=await buildEkodiPublicRegistry(env);
  const lines=['# EKODI Public Discovery','','Canonical host: https://ekodi.kr','Public Registry: https://ekodi.kr/public-registry.json','Sitemap: https://ekodi.kr/sitemap.xml','','## Public resources'];
  for(const resource of registry.resources){
    const label=String(resource.name||resource.path||resource.url).replace(/[\r\n]+/g,' ').trim();
    const description=String(resource.description||'').replace(/[\r\n]+/g,' ').trim();
    lines.push(`- [${label}](${resource.url})${description?' — '+description:''}`);
  }
  const body=lines.join('\n')+'\n';
  return new Response(head?null:body,{status:200,headers:{
    'content-type':'text/plain; charset=utf-8',
    'cache-control':'public, max-age=60, stale-while-revalidate=300',
    'x-content-type-options':'nosniff',
    'x-ekodi-route':'dynamic-public-llms',
  }});
}
