const EVENT_TYPES = new Set(['view','click','lead','add_to_cart','checkout','purchase']);
const clean = (value, max=500) => String(value ?? '').trim().slice(0,max);
const uid = () => `evt_${crypto.randomUUID().replace(/-/g,'')}`;

function json(data,status=200,headers={}) {
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
}

function allowedOrigin(request,env={}) {
  const origin=clean(request.headers.get('origin'),300);
  if(!origin) return '';
  const allowed=new Set(String(env.SOCIAL_EVENT_ORIGINS||'https://mall.ekodi.kr,https://ekodi.kr').split(',').map(v=>v.trim()).filter(Boolean));
  return allowed.has(origin)?origin:'';
}

export async function handleSocialAttribution(request,env) {
  const url=new URL(request.url);
  if(url.pathname!=='/api/social/attribution') return null;
  const origin=allowedOrigin(request,env);
  if(request.method==='OPTIONS') {
    if(!origin) return json({error:'origin_not_allowed'},403);
    return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400','cache-control':'no-store','vary':'Origin'}});
  }
  if(request.method!=='POST') return json({error:'method_not_allowed'},405);
  if(!origin) return json({error:'origin_not_allowed'},403);
  if(!env.DB) return json({error:'db_not_configured'},503);
  let body; try { body=await request.json(); } catch { return json({error:'invalid_body'},400); }
  const postId=clean(body?.postId,100);
  const eventType=clean(body?.eventType,40);
  if(!/^post_[a-f0-9]{32}$/i.test(postId) || !EVENT_TYPES.has(eventType)) return json({error:'invalid_attribution'},400);
  const post=await env.DB.prepare('SELECT id,tenant_id,campaign_id,state FROM social_posts WHERE id=?').bind(postId).first();
  if(!post) return json({error:'post_not_found'},404);
  if(post.state!=='published') return json({error:'post_not_published'},409);
  const value=Number(body?.value||0);
  await env.DB.prepare('INSERT INTO social_events (id,tenant_id,post_id,campaign_id,event_type,value,currency,anonymous_id,referrer,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(uid(),post.tenant_id,post.id,post.campaign_id||null,eventType,Number.isFinite(value)?value:0,clean(body?.currency,8),clean(body?.anonymousId,120),clean(request.headers.get('referer'),500),new Date().toISOString()).run();
  return json({ok:true,postId,eventType},202,{'access-control-allow-origin':origin,'vary':'Origin'});
}
