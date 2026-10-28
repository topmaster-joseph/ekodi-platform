// EKODI Growth OS organization/site inventory: highest-admin read-only control API.
// A site-publication catalog is NOT a verified legal-organization or impact ledger.
// This handler does not seed or mutate the publication controls database.
import authWorker from './auth-worker.js';
import { sitePublicationCatalog } from './site-publication-runtime.js';

export const GROWTH_ORGANIZATIONS_PATH='/api/control/growth-os/organizations';
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer',
}});
const reject=(status,code)=>json({ok:false,code},status);
const clean=(value,max=160)=>String(value??'').trim().slice(0,max);
function sameOrigin(request){
  const raw=request.headers.get('origin');
  if(!raw)return true; // Server callers still require an authenticated session.
  try {const url=new URL(request.url);return url.protocol==='https:'&&raw===url.origin;}catch{return false;}
}
async function authorize(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{
    method:'GET',headers:request.headers
  }),env);
  if(!response.ok)return {status:401,code:'SESSION_REQUIRED'};
  const s=await response.json().catch(()=>null);
  if(s?.authenticated!==true)return {status:401,code:'SESSION_REQUIRED'};
  if(s?.role!=='super_admin')return {status:403,code:'SUPER_ADMIN_REQUIRED'};
  return null;
}
export function projectGrowthOrganizationInventory(catalog,controls,{limit=300}={}){
  if(!Array.isArray(catalog)||!Array.isArray(controls))throw new TypeError('VERIFIED_SITE_REGISTRY_REQUIRED');
  const rowById=new Map();
  for(const row of controls){
    if(typeof row?.site_id==='string' && !rowById.has(row.site_id))rowById.set(row.site_id,row);
  }
  const recognized=new Set(['public','private','maintenance']);
  const unique=new Set();
  const all=[];
  for(const source of catalog){
    if(!source?.id||!source?.workspaceId)continue;
    let canonical;
    try{
      const u=new URL(source.canonicalUrl);
      if(u.protocol!=='https:'||u.hostname!=='ekodi.kr'||u.username||u.password||u.search||u.hash)continue;
      if(!u.pathname.startsWith('/'))continue;
      canonical=u.pathname.replace(/\/$/,'')||'/';
      if(/(?:^|\/)(admin|api|auth|oauth|my)(?:\/|$)/.test(canonical))continue;
    }catch{continue}
    const id=clean(source.id,100),workspaceId=clean(source.workspaceId,128);
    if(!id||!workspaceId||unique.has(id))continue;
    unique.add(id);
    const control=rowById.get(id);
    const controlId=control?.workspace_id?clean(control.workspace_id,128):null;
    const identityStatus=!control?'unconfirmed':controlId===workspaceId?'registry_corresponds':'identity_conflict';
    const publicStatus=recognized.has(control?.public_status)?control.public_status:'unknown';
    all.push({
      id,workspaceId,name:clean(source.name||id),basePath:canonical,
      kind:'site',source:clean(source.source||'unknown',50),publicStatus,identityStatus,
      purposeStatus:'owner_confirmation_required',
      evidenceStatus:'not_connected',
    });
  }
  all.sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id));
  const safeLimit=Math.max(1,Math.min(300,Math.trunc(Number(limit)||300)));
  const sites=all.slice(0,safeLimit);
  return Object.freeze({
    sites,summary:{
      listedSiteSurfaces:sites.length,truncated:all.length>safeLimit,
      identifiedWorkspaceKeys:new Set(sites.map(s=>s.workspaceId)).size,
      private:sites.filter(s=>s.publicStatus==='private').length,
      maintenance:sites.filter(s=>s.publicStatus==='maintenance').length,
      statusUnknown:sites.filter(s=>s.publicStatus==='unknown').length,
      identityConflicts:sites.filter(s=>s.identityStatus==='identity_conflict').length,
    }
  });
}
export async function handleGrowthOrganizationControl(request,env){
  const url=new URL(request.url);
  if(url.pathname!==GROWTH_ORGANIZATIONS_PATH)return null;
  if(request.method!=='GET')return reject(405,'METHOD_NOT_ALLOWED');
  if(!sameOrigin(request))return reject(403,'CROSS_ORIGIN_FORBIDDEN');
  let denied;
  try{denied=await authorize(request,env);}catch{return reject(503,'SESSION_VERIFY_UNAVAILABLE');}
  if(denied)return reject(denied.status,denied.code);
  if(!env?.DB?.prepare)return reject(503,'REGISTRY_DATABASE_UNAVAILABLE');
  try{
    // IMPORTANT: sitePublicationCatalog is read-only; NEVER use listSitePublicationSettings
    // here, because that call seeds public_site_controls with INSERT OR IGNORE.
    const [catalog,result]=await Promise.all([
      sitePublicationCatalog(env),
      env.DB.prepare('SELECT site_id,workspace_id,public_status FROM public_site_controls').all(),
    ]);
    if(!result||!Array.isArray(result.results))return reject(503,'SITE_STATUS_READ_UNAVAILABLE');
    const projection=projectGrowthOrganizationInventory(catalog,result.results);
    return json({
      ok:true,schemaVersion:1,scope:'platform-super-admin-read-only',
      source:'sitePublicationCatalog + public_site_controls (SELECT only)',
      generatedAt:new Date().toISOString(),...projection,
      limitations:[
        'Site surfaces are not a complete organization/legal entity registry.',
        'workspaceId is a matching candidate, not permission to read organization data.',
        'Purpose and evidence require each accountable organization owner confirmation.',
        'Unknown publication status is never treated as public or zero growth.',
      ],
    });
  }catch(error){
    console.error('[Growth OS] protected inventory read unavailable',clean(error?.message,160));
    return reject(503,'GROWTH_INVENTORY_UNAVAILABLE');
  }
}
