import authWorker from './auth-worker.js';

const PREFIX = '/api/control/ai/providers';
const PROVIDERS = Object.freeze({
  openai: { label:'OpenAI', secretBinding:'OPENAI_API_KEY', defaultModel:'gpt-5.6-terra', priority:10 },
  gemini: { label:'Google Gemini', secretBinding:'GEMINI_API_KEY', defaultModel:'gemini-3.1-flash-lite', priority:20 },
  anthropic: { label:'Anthropic', secretBinding:'ANTHROPIC_API_KEY', defaultModel:'claude-haiku-4-5-20251001', priority:30 },
});
const MODEL_RE = /^[A-Za-z0-9._:-]{1,120}$/;

function json(data,status=200,headers=new Headers()){
  const out=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  for(const name of ['access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-max-age','vary']){const value=headers.get(name);if(value)out.set(name,value)}
  return new Response(JSON.stringify(data),{status,headers:out});
}
async function sessionCheck(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return {response};
  const session=await response.clone().json();return {response,session};
}
export async function ensureAiProviderRegistry(db){
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_provider_registry (
      provider_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, priority INTEGER NOT NULL,
      default_model TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT 'system', updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_provider_registry_audit (
      id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, action TEXT NOT NULL, admin_email TEXT NOT NULL,
      before_json TEXT NOT NULL DEFAULT '{}', after_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)`),
  ]);
  const now=new Date().toISOString();
  for(const [id,def] of Object.entries(PROVIDERS)){
    await db.prepare(`INSERT OR IGNORE INTO ai_provider_registry(provider_id,enabled,priority,default_model,updated_by,updated_at) VALUES(?,?,?,?,?,?)`)
      .bind(id,1,def.priority,def.defaultModel,'system',now).run();
  }
}
function configured(env,id){const def=PROVIDERS[id];return Boolean(def&&String(env[def.secretBinding]||'').trim())}
async function rows(env){
  await ensureAiProviderRegistry(env.DB);
  const result=await env.DB.prepare('SELECT provider_id,enabled,priority,default_model,updated_by,updated_at FROM ai_provider_registry ORDER BY priority ASC, provider_id ASC').all();
  return (result.results||[]).map(row=>({
    id:row.provider_id,label:PROVIDERS[row.provider_id]?.label||row.provider_id,
    enabled:Boolean(row.enabled),priority:Number(row.priority),model:String(row.default_model||''),
    configured:configured(env,row.provider_id),secretStored:configured(env,row.provider_id),secretValueExposed:false,
    updatedBy:row.updated_by,updatedAt:row.updated_at,
  }));
}
async function probe(env,id,model){
  const def=PROVIDERS[id];if(!def)return {ok:false,code:'UNKNOWN_PROVIDER'};
  const key=String(env[def.secretBinding]||'').trim();if(!key)return {ok:false,code:'PROVIDER_NOT_CONFIGURED'};
  let response;
  if(id==='openai')response=await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`,{headers:{authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10000)});
  else if(id==='gemini')response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(10000)});
  else return {ok:true,code:'CONFIGURED_NO_LIGHTWEIGHT_PROBE'};
  return {ok:response.ok,code:response.ok?'HEALTHY':`HTTP_${response.status}`,httpStatus:response.status};
}
export async function getAiProviderRuntimeRegistry(env={}){
  if(!env.DB?.prepare)return Object.entries(PROVIDERS).map(([id,def])=>({id,enabled:true,priority:def.priority,model:String(env[`${id.toUpperCase()}_MODEL`]||def.defaultModel),configured:configured(env,id)}));
  return rows(env);
}
export async function handleAiProviderRegistryControl(request,env={}){
  const url=new URL(request.url);if(!url.pathname.startsWith(PREFIX))return null;
  const auth=await sessionCheck(request,env);if(!auth.session?.authenticated)return auth.response;
  if(!env.DB?.prepare)return json({error:'AI provider registry DB is unavailable.',code:'AI_PROVIDER_DB_REQUIRED'},503,auth.response.headers);
  await ensureAiProviderRegistry(env.DB);
  if(request.method==='GET'&&url.pathname===PREFIX){
    return json({ok:true,contract:'ekodi.ai-providers.v1',providers:await rows(env),secretPolicy:{storedServerSideOnly:true,valuesReturned:false},generatedAt:new Date().toISOString()},200,auth.response.headers);
  }
  const match=url.pathname.match(/^\/api\/control\/ai\/providers\/([a-z0-9_-]+)(\/probe)?$/);if(!match)return null;
  const id=match[1];if(!PROVIDERS[id])return json({error:'Unknown provider.',code:'UNKNOWN_PROVIDER'},404,auth.response.headers);
  if(request.method==='POST'&&match[2]==='/probe'){
    const current=(await rows(env)).find(row=>row.id===id);const result=await probe(env,id,current?.model||PROVIDERS[id].defaultModel);
    return json({ok:result.ok,provider:id,configured:configured(env,id),model:current?.model,health:result,checkedAt:new Date().toISOString()},result.ok?200:503,auth.response.headers);
  }
  if(request.method!=='PATCH'||match[2])return json({error:'Method not allowed.',code:'METHOD_NOT_ALLOWED'},405,auth.response.headers);
  if(request.headers.get('x-ekodi-confirm-impact')!=='ai-provider-policy-update')return json({error:'Explicit administrator approval is required.',code:'PROVIDER_POLICY_CONFIRMATION_REQUIRED'},428,auth.response.headers);
  let body;try{body=await request.json()}catch{return json({error:'Invalid JSON.',code:'INVALID_JSON'},400,auth.response.headers)}
  const before=(await rows(env)).find(row=>row.id===id);const enabled=body.enabled==null?before.enabled:Boolean(body.enabled);
  const priority=body.priority==null?before.priority:Math.max(1,Math.min(999,Number(body.priority)||before.priority));
  const model=body.model==null?before.model:String(body.model).trim();if(!MODEL_RE.test(model))return json({error:'Invalid model id.',code:'INVALID_MODEL'},400,auth.response.headers);
  const now=new Date().toISOString(),email=String(auth.session.email||'admin');
  await env.DB.prepare('UPDATE ai_provider_registry SET enabled=?,priority=?,default_model=?,updated_by=?,updated_at=? WHERE provider_id=?').bind(enabled?1:0,priority,model,email,now,id).run();
  const after=(await rows(env)).find(row=>row.id===id);
  await env.DB.prepare('INSERT INTO ai_provider_registry_audit(id,provider_id,action,admin_email,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,'policy_update',email,JSON.stringify(before),JSON.stringify(after),now).run();
  return json({ok:true,provider:after,secretValueExposed:false},200,auth.response.headers);
}

export const AI_PROVIDER_REGISTRY_DEFINITIONS=PROVIDERS;
