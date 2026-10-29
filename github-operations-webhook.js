// EKODI GitHub Operations. Ingress only: never perform GitHub writes or deploy.
const CANONICAL_REPO = 'topmaster-joseph/ekodi-platform';
const ALLOWED = new Set(['push','pull_request','workflow_run','check_run','issues','issue_comment']);
const MAX_BYTES = 262144;
const response = (status, data) => new Response(JSON.stringify(data), {status, headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff'
}});
const clean = (v,n=128) => String(v ?? '').slice(0,n).replace(/[\r\n<>]/g,'');
const validSha = v => /^[a-f0-9]{40}$/.test(String(v||''));
const hex = data => Array.from(new Uint8Array(data),x=>x.toString(16).padStart(2,'0')).join('');

export async function verifyGitHubSignature(raw, signature, secret, subtle=crypto.subtle) {
  if(!/^sha256=[0-9a-f]{64}$/.test(String(signature||''))||
    typeof secret!=='string'||secret.length<32) return false;
  const key=await subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const expected=new Uint8Array(await subtle.sign('HMAC',key,raw));
  const supplied=new Uint8Array((signature.slice(7).match(/../g)||[]).map(x=>parseInt(x,16)));
  if(supplied.length!==expected.length)return false;
  let diff=0;for(let i=0;i<expected.length;i++)diff|=expected[i]^supplied[i];
  return diff===0;
}

export function projectGitHubEvent(event,payload) {
  const sha=payload?.after||payload?.pull_request?.head?.sha||
    payload?.workflow_run?.head_sha||payload?.check_run?.head_sha||'';
  const source=Number(payload?.pull_request?.number||payload?.workflow_run?.id||
    payload?.check_run?.id||payload?.issue?.number||payload?.number||0);
  return {
    repository:clean(payload?.repository?.full_name,100),
    installationId:Number.isSafeInteger(Number(payload?.installation?.id))
      ?Number(payload.installation.id):null,
    type:event,action:clean(payload?.action||(event==='push'?'pushed':'observed'),48),
    headSha:validSha(sha)?sha:null,
    sourceNumber:Number.isSafeInteger(source)&&source>0?source:null,
    priority:event==='workflow_run'&&payload?.workflow_run?.conclusion==='failure'?10:50
  };
}

export async function eventOperationKey(event,payload,subtle=crypto.subtle) {
  const p=projectGitHubEvent(event,payload);
  const attempt=payload?.workflow_run?.run_attempt||0;
  // Different comments on the same issue are different operations, despite
  // having the same issue number, action, and absent commit SHA.
  const eventIdentity=event==='issue_comment'?payload?.comment?.id||''
    :event==='issues'?payload?.issue?.updated_at||''
    :event==='push'?payload?.ref||'' :'';
  return hex(await subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([
    p.repository,p.type,p.action,p.headSha,p.sourceNumber,attempt,eventIdentity
  ]))));
}

export async function acceptGitHubWebhook(request,env) {
  if(new URL(request.url).pathname!=='/api/orchestrator/github/webhook')
    return response(404,{ok:false,code:'GITHUB_WEBHOOK_NOT_FOUND'});
  if(request.method!=='POST')return response(405,{ok:false,code:'GITHUB_WEBHOOK_POST_ONLY'});
  // Secret and owner provisioned installation must both be present before activation.
  if(env.EKODI_GITHUB_WEBHOOK_ENABLED!=='true'||
    !String(env.EKODI_GITHUB_WEBHOOK_SECRET||'').trim()||
    !Number.isSafeInteger(Number(env.EKODI_GITHUB_INSTALLATION_ID))||
    Number(env.EKODI_GITHUB_INSTALLATION_ID)<1)
    return response(503,{ok:false,code:'GITHUB_WEBHOOK_NOT_PROVISIONED'});
  if(request.headers.has('origin'))
    return response(403,{ok:false,code:'GITHUB_WEBHOOK_BROWSER_DENIED'});
  const len=Number(request.headers.get('content-length')||0);
  if(len>MAX_BYTES)return response(413,{ok:false,code:'GITHUB_WEBHOOK_TOO_LARGE'});
  const delivery=request.headers.get('x-github-delivery')||'';
  const event=request.headers.get('x-github-event')||'';
  if(!/^[0-9a-fA-F-]{36}$/.test(delivery)||!ALLOWED.has(event))
    return response(400,{ok:false,code:'GITHUB_WEBHOOK_METADATA_INVALID'});
  const raw=await request.arrayBuffer();
  if(raw.byteLength>MAX_BYTES)return response(413,{ok:false,code:'GITHUB_WEBHOOK_TOO_LARGE'});
  if(!(await verifyGitHubSignature(raw,request.headers.get('x-hub-signature-256'),
    env.EKODI_GITHUB_WEBHOOK_SECRET)))
    return response(401,{ok:false,code:'GITHUB_WEBHOOK_SIGNATURE_INVALID'});
  let payload;
  try{payload=JSON.parse(new TextDecoder().decode(raw));}
  catch{return response(400,{ok:false,code:'GITHUB_WEBHOOK_JSON_INVALID'});}
  const p=projectGitHubEvent(event,payload);
  if(p.repository!==CANONICAL_REPO)
    return response(403,{ok:false,code:'GITHUB_WEBHOOK_REPOSITORY_DENIED'});
  if(p.installationId!==Number(env.EKODI_GITHUB_INSTALLATION_ID))
    return response(403,{ok:false,code:'GITHUB_WEBHOOK_INSTALLATION_DENIED'});
  if(!env.DB?.prepare)
    return response(503,{ok:false,code:'GITHUB_OPERATIONS_DB_UNAVAILABLE'});
  const operationKey=await eventOperationKey(event,payload);
  const now=new Date().toISOString();
  try {
    const insert=await env.DB.prepare(
      'INSERT OR IGNORE INTO github_operations_webhook_events '+
      '(delivery_id,operation_key,repository,installation_id,event_type,event_action,'+
      'head_sha,source_number,priority,state,created_at) '+
      "VALUES (?,?,?,?,?,?,?,?,?,'observed',?)"
    ).bind(delivery,operationKey,p.repository,p.installationId,p.type,p.action,
      p.headSha,p.sourceNumber,p.priority,now).run();
    await env.DB.prepare(
      'INSERT OR IGNORE INTO github_operations_jobs '+
      '(operation_key,repository,kind,priority,state,attempts,created_at,updated_at) '+
      "VALUES (?,?,'observation_only',?,'queued',0,?,?)"
    ).bind(operationKey,p.repository,p.priority,now,now).run();
    const duplicate=!(insert?.meta?.changes>0);
    return response(duplicate?200:202,{
      ok:true,accepted:true,duplicate,operationKey,releaseAuthorized:false,githubApiCalls:0
    });
  }catch {
    return response(503,{ok:false,code:'GITHUB_OPERATIONS_STORAGE_UNAVAILABLE'});
  }
}

export async function githubOperationsSnapshot(env,limit=30) {
  if(!env.DB?.prepare)throw Error('GITHUB_OPERATIONS_DB_UNAVAILABLE');
  const max=Math.min(Math.max(Number(limit)||30,1),100);
  const [events,jobs,summary]=await Promise.all([
    env.DB.prepare('SELECT event_type,event_action,head_sha,source_number,priority,created_at '+
      'FROM github_operations_webhook_events ORDER BY created_at DESC LIMIT ?').bind(max).all(),
    env.DB.prepare('SELECT operation_key,kind,priority,state,attempts,created_at,updated_at '+
      'FROM github_operations_jobs ORDER BY created_at DESC LIMIT ?').bind(max).all(),
    env.DB.prepare('SELECT state,COUNT(*) count FROM github_operations_jobs GROUP BY state').all(),
  ]);
  return {schemaVersion:1,authority:'EKODI Orchestrator',integration:'observation_only',
    releaseAuthorized:false,githubApiRemaining:null,githubApiBudgetSource:'not_connected',
    tokenExposed:false,events:events.results||[],jobs:jobs.results||[],
    counts:summary.results||[]};
}

// Existing Mission Control cron drains local observation jobs only. No API token.
export async function drainGitHubObservations(env,{limit=10}={}) {
  if(!env.DB?.prepare)return{processed:0,reason:'db_unavailable'};
  const max=Math.min(Math.max(Number(limit)||10,1),25);
  let rows;
  try{
    rows=(await env.DB.prepare("SELECT operation_key FROM github_operations_jobs "+
      "WHERE state='queued' AND kind='observation_only' "+
      'ORDER BY priority ASC,created_at ASC LIMIT ?').bind(max).all()).results||[];
  }catch{return{processed:0,reason:'schema_unavailable'};}
  let processed=0;
  for(const row of rows){
    const result=await env.DB.prepare("UPDATE github_operations_jobs SET "+
      "state='observed',attempts=attempts+1,updated_at=? "+
      "WHERE operation_key=? AND kind='observation_only' AND state='queued'")
      .bind(new Date().toISOString(),row.operation_key).run();
    processed+=Number(result?.meta?.changes===1);
  }
  return{processed,githubApiCalls:0,deployments:0};
}
