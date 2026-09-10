import siteWorker from './site-worker.js';
import { serviceForId } from './ekodi-service-manifest.js';
import { injectEkodiShell, shellServiceForHost, shellServiceForRootPath } from './ekodi-shell-injector.js';
import { isWorkspaceAdminPathShape, isWorkspaceSlug } from './workspace-route-policy.js';
import { resolveWorkspaceVisualDNA, workspaceVisualCssVariables } from './workspace-visual-dna.js';

const PUBLIC_HOST='ekodi.kr';
const USER_SURFACES=new Set(['public','workspace']);

function shellEligibleHost(hostname){
  const host=String(hostname||'').toLowerCase();
  return host===PUBLIC_HOST||Boolean(shellServiceForHost(host));
}

function normalizedPath(pathname){
  const value=`/${String(pathname||'/').replace(/^\/+|\/+$/g,'')}`;
  return value==='/'?'/':value.toLowerCase();
}

function rootUserService(pathname){
  const path=normalizedPath(pathname);
  const canonical=shellServiceForRootPath(path);
  if(canonical)return canonical;
  const first=path.split('/').filter(Boolean)[0]||'';
  const service=serviceForId(first);
  if(!service||!USER_SURFACES.has(String(service.defaultSurface||'').toLowerCase()))return '';
  return service.id;
}

function workspaceSlugForPath(pathname){
  const path=normalizedPath(pathname);
  if(isWorkspaceAdminPathShape(path))return '';
  const first=path.split('/').filter(Boolean)[0]||'';
  return isWorkspaceSlug(first)?first:'';
}

function standaloneBrandPlacePath(pathname){
  return normalizedPath(pathname)==='/pizzamaru/mokpodae';
}

function rootInternalPath(pathname){
  const path=normalizedPath(pathname);
  return path==='/admin'||path==='/admin.html'||path.startsWith('/admin/');
}

function workspaceVisualStyle(dna){
  const vars=workspaceVisualCssVariables(dna);
  const declarations=Object.entries(vars).map(([key,value])=>`${key}:${value}`).join(';');
  return `<style data-ekodi-workspace-visual-dna="v1">:root{${declarations}}html[data-ekodi-workspace-visual] body{background-color:var(--ekodi-workspace-canvas);color:var(--ekodi-workspace-ink)}html[data-ekodi-workspace-visual] :where(.card,.panel,.tile,.box,.surface,[data-card]){border-radius:var(--ekodi-workspace-radius)}html[data-ekodi-workspace-visual] :where(a,button,.button,[role="button"]){accent-color:var(--ekodi-workspace-accent)}html[data-ekodi-workspace-visual] :where(.button.primary,button.primary,[data-primary-action]){background:var(--ekodi-workspace-accent);border-color:var(--ekodi-workspace-accent)}html[data-ekodi-workspace-visual] ::selection{background:var(--ekodi-workspace-secondary);color:var(--ekodi-workspace-ink)}</style>`;
}

class WorkspaceVisualHtml{
  constructor(dna){this.dna=dna;}
  element(element){
    element.setAttribute('data-ekodi-workspace-visual',this.dna.identityHash);
    element.setAttribute('data-ekodi-workspace-family',this.dna.family);
    element.setAttribute('data-ekodi-workspace-geometry',this.dna.geometry);
    element.setAttribute('data-ekodi-workspace-pattern',this.dna.pattern);
    element.setAttribute('data-ekodi-workspace-hero',`${this.dna.hero}-${this.dna.heroVariant}`);
  }
}
class WorkspaceVisualHead{
  constructor(dna){this.dna=dna;}
  element(element){element.append(workspaceVisualStyle(this.dna),{html:true});}
}

function applyWorkspaceVisual(response,slug){
  if(!response||!slug)return response;
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  if(!contentType.includes('text/html'))return response;
  const workspaceKind=String(response.headers.get('x-ekodi-workspace-kind')||'organization');
  const workspaceId=String(response.headers.get('x-ekodi-workspace-id')||slug);
  const dna=resolveWorkspaceVisualDNA({workspaceId,kind:workspaceKind});
  const headers=new Headers(response.headers);
  headers.set('x-ekodi-workspace-visual-dna','v1');
  headers.set('x-ekodi-workspace-visual-id',dna.identityHash);
  headers.set('x-ekodi-workspace-visual-family',dna.family);
  return new HTMLRewriter()
    .on('html',new WorkspaceVisualHtml(dna))
    .on('head',new WorkspaceVisualHead(dna))
    .transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
}

function effectiveRequest(request, env) {
  const original = new URL(request.url);
  if (env?.ENVIRONMENT !== 'staging') return { request, host: original.hostname.toLowerCase() };
  const requested = String(request.headers.get('x-ekodi-staging-host') || '').trim().toLowerCase();
  if (!shellEligibleHost(requested)) return { request, host: original.hostname.toLowerCase() };
  const simulated = new URL(original);
  simulated.hostname = requested;
  const headers = new Headers(request.headers);
  headers.delete('x-ekodi-staging-host');
  return {
    request: new Request(simulated, {
      method: request.method,
      headers,
      body: ['GET','HEAD'].includes(request.method) ? undefined : request.body,
      redirect: request.redirect,
    }),
    host: requested,
  };
}

export default {
  async fetch(request, env, ctx) {
    const effective = effectiveRequest(request, env);
    const response = await siteWorker.fetch(effective.request, env, ctx);
    if (effective.host === PUBLIC_HOST) {
      const pathname=new URL(effective.request.url).pathname;
      if(rootInternalPath(pathname)||standaloneBrandPlacePath(pathname)||isWorkspaceAdminPathShape(pathname))return response;
      const serviceId=rootUserService(pathname);
      if(serviceId)return injectEkodiShell(response,serviceId);
      const workspaceSlug=workspaceSlugForPath(pathname);
      if(workspaceSlug){
        const shelled=injectEkodiShell(response,'ekodi','workspace');
        return applyWorkspaceVisual(shelled,workspaceSlug);
      }
      return injectEkodiShell(response,'ekodi','public');
    }
    const serviceId = shellServiceForHost(effective.host);
    if (!serviceId) return response;
    return injectEkodiShell(response, serviceId);
  },
};
