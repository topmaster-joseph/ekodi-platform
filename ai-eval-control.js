import authWorker from './auth-worker.js';
import {queryOperationalSnapshot, unresolvedEvaluationSnapshot} from './eval/operations-projection.mjs';

const ROUTE='/api/control/ai/eval/summary';

function json(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
    'x-robots-tag':'noindex, nofollow, noarchive',
  }});
}

async function checkedSession(request,env){
  const endpoint=new URL(request.url);
  endpoint.pathname='/api/session';
  endpoint.search='';
  const response=await authWorker.fetch(new Request(endpoint.toString(),{
    method:'GET',
    headers:request.headers,
  }),env);
  if(!response.ok)return {error:json({error:'AUTH_SESSION_UNAVAILABLE'},response.status>=500?503:401)};
  const session=await response.json().catch(()=>null);
  if(session?.authenticated!==true)return {error:json({error:'AUTH_REQUIRED'},401)};
  if(session?.role!=='super_admin')return {error:json({error:'SUPER_ADMIN_REQUIRED'},403)};
  return {session};
}

/**
 * Private, read-only evaluation summary.
 * Operational success counters are NOT independently graded agent quality.
 * Requires a real server-verified super_admin session; no client admin claims.
 */
export async function handleAiEvalSummary(request,env={}){
  if(new URL(request.url).pathname!==ROUTE)return null;
  if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
  const auth=await checkedSession(request,env);
  if(auth.error)return auth.error;
  if(!env.DB?.prepare)return json({error:'EVAL_OBSERVATION_DB_UNAVAILABLE',status:'confirm_required'},503);
  try{
    const operations=await queryOperationalSnapshot(env.DB);
    return json(unresolvedEvaluationSnapshot(operations));
  }catch(error){
    // No D1 contents, SQL statements, raw task bodies or secrets in error responses.
    console.warn('EKODI Eval Lab aggregate source unavailable',String(error?.name||'read-error').slice(0,48));
    return json({error:'EVAL_AGGREGATES_UNAVAILABLE',status:'confirm_required'},503);
  }
}
