// Dependency-injected API handler. Not mounted to production routing until reviewed.
// Storage adapter must implement upsertSubscription, disableSubscription and enforce encryption-at-rest.
import {validatePushSubscription,sameOriginRequest} from './devotion-push-validation.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function handleDevotionalPush(request,{storage,authorize,rateLimit}={}) {
  if (!sameOriginRequest(request)) return json({error:'forbidden_origin'},403);
  if (typeof authorize !== 'function' || typeof rateLimit !== 'function' || !storage) return json({error:'not_configured'},503);
  const user=await authorize(request);
  if (!user?.id) return json({error:'login_required'},401);
  if (!(await rateLimit(user.id,request))) return json({error:'rate_limited'},429);
  const raw=await request.text();
  if (raw.length>8192) return json({error:'payload_too_large'},413);
  let data;
  try { data=JSON.parse(raw); } catch { return json({error:'invalid_json'},400); }
  if (request.method==='POST') {
    let input;
    try { input=validatePushSubscription(data); } catch { return json({error:'invalid_subscription'},400); }
    if (typeof storage.upsertSubscription!=='function') return json({error:'not_configured'},503);
    await storage.upsertSubscription({...input,userId:user.id});
    return json({ok:true});
  }
  if (request.method==='DELETE') {
    if (!['mission','church'].includes(data?.site) || typeof data?.endpoint!=='string' || data.endpoint.length>2048) return json({error:'invalid_subscription'},400);
    if (typeof storage.disableSubscription!=='function') return json({error:'not_configured'},503);
    await storage.disableSubscription({site:data.site,endpoint:data.endpoint,userId:user.id});
    return json({ok:true});
  }
  return json({error:'method_not_allowed'},405);
}
