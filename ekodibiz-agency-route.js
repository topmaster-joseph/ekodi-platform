// EKODIBIZ AI purchasing agency: narrowly-scoped canonical proxy.
// Never grant the general EKODIBIZ worker access to unrelated apex paths.
const AGENCY_ENTRY = /^\/ekodibiz\/(?:ai-agency(?:\/|\.js|\/(?:apply|university|individual|admin)\/?)?|ai-agency-admin(?:\/|\.js)?)$/;
const AGENCY_SHARED_SCRIPT = '/ekodibiz/ai-agency-links.js';
const AGENCY_API = /^\/ekodibiz\/api\/agency\/[a-z0-9/-]+$/;

export function isEkodibizAgencyPath(pathname) {
  return pathname===AGENCY_SHARED_SCRIPT || AGENCY_ENTRY.test(String(pathname || '')) || AGENCY_API.test(String(pathname || ''));
}

export async function proxyEkodibizAgency(request, env) {
  const url = new URL(request.url);
  if (url.hostname !== 'ekodi.kr' || !isEkodibizAgencyPath(url.pathname)) {
    return new Response('Not found', {status:404,headers:{'cache-control':'no-store'}});
  }
  if (!env?.EKODIBIZ || typeof env.EKODIBIZ.fetch !== 'function') {
    return new Response(JSON.stringify({error:'agency_service_unavailable'}), {
      status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
    });
  }
  // Preserve method, body, Origin and the original canonical URL. The owning worker
  // validates user/admin authority and publishes its own restrictive Toss widget CSP.
  const upstream = await env.EKODIBIZ.fetch(request);
  const headers = new Headers(upstream.headers);
  headers.set('cache-control','no-store');
  headers.set('x-ekodi-canonical-service','ekodibiz-agency');
  headers.set('x-content-type-options','nosniff');
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers});
}
