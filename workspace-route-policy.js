import { isReservedPlatformRoot, platformRouteRegistrySnapshot } from './platform-route-registry.js';

const WORKSPACE_SLUG=/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
export const RESERVED_WORKSPACE_SLUGS=new Set(platformRouteRegistrySnapshot().reserved);

export function normalizeWorkspaceSlug(value){
  return String(value||'').trim().toLowerCase();
}

export function isWorkspaceSlug(value){
  const slug=normalizeWorkspaceSlug(value);
  return WORKSPACE_SLUG.test(slug)&&!isReservedPlatformRoot(slug);
}

function publicPathSegments(pathname){
  const path=String(pathname||'');
  if(!path.startsWith('/')||path.includes('//'))return null;
  const trimmed=path.replace(/^\/+|\/+$/g,'');
  if(!trimmed)return [];
  const segments=trimmed.split('/');
  if(segments.some(part=>!part||part==='.'||part==='..'))return null;
  return segments;
}
export function workspaceRouteFromPublicPath(pathname){
  const segments=publicPathSegments(pathname);
  if(!segments?.length||!isWorkspaceSlug(segments[0]))return null;
  const slug=normalizeWorkspaceSlug(segments[0]);
  const serviceSegments=segments.slice(1);
  const legacyAdmin=serviceSegments.some(part=>part.toLowerCase()==='admin');
  return Object.freeze({
    routeKind:legacyAdmin?'legacy-admin':'workspace',
    slug,
    service:serviceSegments[0]||null,
    servicePath:serviceSegments.join('/'),
    serviceSegments:Object.freeze([...serviceSegments]),
    public:!legacyAdmin,
    locatorOnly:true,
  });
}

export function workspaceSlugFromPublicPath(pathname){
  return workspaceRouteFromPublicPath(pathname)?.slug||null;
}

export function workspaceServiceFromPublicPath(pathname){
  const route=workspaceRouteFromPublicPath(pathname);
  return route?.public?route.service:null;
}
export function isPublicWorkspacePath(pathname){
  if(String(pathname||'')==='/deployment-probe')return true;
  return workspaceRouteFromPublicPath(pathname)?.public===true;
}

export function isPublicWorkspaceRootPath(pathname){
  const route=workspaceRouteFromPublicPath(pathname);
  return Boolean(route?.public&&!route.service);
}

export async function resolveWorkspaceRoute(pathname,resolveBySlug){
  const locator=workspaceRouteFromPublicPath(pathname);
  if(!locator?.public)return locator;
  if(typeof resolveBySlug!=='function')return Object.freeze({...locator,routeKind:'unresolved',workspaceId:null,identityResolved:false});
  const resolved=await resolveBySlug(locator.slug);
  const workspaceId=String(resolved?.workspace_id||resolved?.workspaceId||'').trim();
  if(!workspaceId)return Object.freeze({...locator,routeKind:'unresolved',workspaceId:null,identityResolved:false});
  return Object.freeze({...locator,routeKind:'workspace',workspaceId,identityResolved:true});
}

function isSiteLocalAdminRoot(value){
  const root=normalizeWorkspaceSlug(value);
  return root==='ekodibiz'||isWorkspaceSlug(root);
}

export function isWorkspaceAdminPathShape(pathname){
  const path=String(pathname||'');
  const match=/^\/([^/]+)\/(?:admin(?:\/[^/]+)?|[^/]+\/admin(?:\/[^/]+)?)\/?$/i.exec(path);
  if(match&&isSiteLocalAdminRoot(match[1]))return true;
  const mallMarketingChannels=/^\/([^/]+)\/mall\/admin\/marketing\/channels\/?$/i.exec(path);
  return Boolean(mallMarketingChannels&&isSiteLocalAdminRoot(mallMarketingChannels[1]));
}
