// Store table-side payment ledger API (Workspace Platform).
//
//   GET  /v1/store-terminal/payments            today's payments for the store (KST)
//   POST /v1/store-terminal/payments            record a request or a manual approval
//   POST /v1/store-terminal/payments/:id/actions {action:'approve'|'fail'|'cancel', approvalNo?}
//   POST /v1/store-terminal/results              vendor app-to-app return (adapter-parsed)
//
// Authorization reuses the store order authority (tenant subject + orders
// capability). No card data is accepted or stored.
import { auditPrincipal } from './ekodi-principal.js';
import { storeOrderAdminContext } from './store-sms-order-runtime.js';
import { STORE_TERMINAL_BRIDGE as BRIDGE } from './store-terminal-bridge.js';

const KST_OFFSET_MS=9*60*60*1000;
const clean=(value,max=200)=>String(value??'').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
const toId=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:0};
const COLUMNS='id,store_slug,order_ref,amount,method,provider,status,request_key,approval_no,approved_at,cancelled_at,created_at,updated_at';

function cors(request,env){
  const origin=clean(request.headers.get('origin'),500);
  const allowedOrigins=clean(env?.ALLOWED_ORIGINS,2000).split(',').map(v=>v.trim()).filter(Boolean);
  const allowed=!origin||allowedOrigins.includes(origin);
  const headers={'access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET, POST, OPTIONS','access-control-max-age':'86400',vary:'Origin'};
  if(origin&&allowed)headers['access-control-allow-origin']=origin;
  return {allowed,headers};
}
function json(request,env,data,status=200){
  const {headers}=cors(request,env);
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers}});
}
async function readJson(request){try{return await request.json()}catch{return null}}

// Start of "today" in KST as a UTC ISO string.
export function kstDayStartIso(now=Date.now()){
  const kst=new Date(now+KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate())-KST_OFFSET_MS).toISOString();
}

async function listPayments(request,env){
  const {ctx,response}=await storeOrderAdminContext(request,env);if(response)return response;
  const rows=await env.DB.prepare(`SELECT ${COLUMNS} FROM store_terminal_payments WHERE store_slug=? AND created_at>=? ORDER BY id DESC LIMIT 200`)
    .bind(ctx.subject.key,kstDayStartIso()).all();
  const payments=rows.results||[];
  await auditPrincipal(env,ctx.principal,'conversation:read');
  return json(request,env,{storeSlug:ctx.subject.key,payments,summary:BRIDGE.summarize(payments),adapters:BRIDGE.publicAdapters()});
}

async function createPayment(request,env){
  const {ctx,response}=await storeOrderAdminContext(request,env,{write:true});if(response)return response;
  const data=await readJson(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const checked=BRIDGE.validateCreate(data);if(!checked.ok)return json(request,env,{error:checked.error},400);
  const v=checked.value;
  if(v.provider!=='manual'&&!BRIDGE.adapterReady(BRIDGE.adapter(v.provider)))return json(request,env,{error:'ADAPTER_NOT_READY',provider:v.provider},409);
  const existing=await env.DB.prepare(`SELECT ${COLUMNS} FROM store_terminal_payments WHERE store_slug=? AND request_key=?`).bind(ctx.subject.key,v.requestKey).first();
  if(existing)return json(request,env,{ok:true,idempotent:true,payment:existing});
  const now=nowIso();
  const result=await env.DB.prepare(`INSERT INTO store_terminal_payments(store_slug,order_ref,amount,method,provider,status,request_key,approval_no,recorded_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(ctx.subject.key,v.orderRef,v.amount,v.method,v.provider,v.status,v.requestKey,v.approvalNo,clean(ctx.principal.id,240),v.status==='approved'?now:null,now,now).run();
  const id=Number(result?.meta?.last_row_id||0);
  await auditPrincipal(env,ctx.principal,'conversation:write');
  return json(request,env,{ok:true,payment:{id,store_slug:ctx.subject.key,order_ref:v.orderRef,amount:v.amount,method:v.method,provider:v.provider,status:v.status,request_key:v.requestKey,approval_no:v.approvalNo,approved_at:v.status==='approved'?now:null,cancelled_at:null,created_at:now,updated_at:now}},201);
}

async function transition(request,env,ctx,row,next,approvalNo=''){
  if(!BRIDGE.canTransition(row.status,next))return json(request,env,{error:'INVALID_PAYMENT_TRANSITION',status:row.status,next},409);
  if(next==='approved'&&!BRIDGE.approvalOk(clean(approvalNo,20)))return json(request,env,{error:'INVALID_APPROVAL_NO'},400);
  const now=nowIso();
  const column=next==='approved'?',approved_at=?':next==='cancelled'?',cancelled_at=?':'';
  const binds=next==='approved'?[next,clean(approvalNo,20),now,now]:next==='cancelled'?[next,row.approval_no||'',now,now]:[next,row.approval_no||'',now];
  // Optimistic guard: only move from the status we read.
  const res=await env.DB.prepare(`UPDATE store_terminal_payments SET status=?,approval_no=?${column},updated_at=? WHERE id=? AND store_slug=? AND status=?`)
    .bind(...binds,row.id,ctx.subject.key,row.status).run();
  if(!Number(res?.meta?.changes||0))return json(request,env,{error:'PAYMENT_CHANGED_CONCURRENTLY'},409);
  await auditPrincipal(env,ctx.principal,'conversation:write');
  const fresh=await env.DB.prepare(`SELECT ${COLUMNS} FROM store_terminal_payments WHERE id=? AND store_slug=?`).bind(row.id,ctx.subject.key).first();
  return json(request,env,{ok:true,payment:fresh});
}

async function actOnPayment(request,env,id){
  const {ctx,response}=await storeOrderAdminContext(request,env,{write:true});if(response)return response;
  const data=await readJson(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const action=clean(data.action,20).toLowerCase();
  const next={approve:'approved',fail:'failed',cancel:'cancelled'}[action];
  if(!next)return json(request,env,{error:'INVALID_ACTION'},400);
  const row=await env.DB.prepare(`SELECT ${COLUMNS} FROM store_terminal_payments WHERE id=? AND store_slug=?`).bind(id,ctx.subject.key).first();
  if(!row)return json(request,env,{error:'PAYMENT_NOT_FOUND'},404);
  // Vendor-routed payments are approved only through their own result path.
  if(next==='approved'&&row.provider!=='manual')return json(request,env,{error:'PROVIDER_APPROVAL_REQUIRES_RESULT'},409);
  return transition(request,env,ctx,row,next,data.approvalNo);
}

async function recordResult(request,env){
  const {ctx,response}=await storeOrderAdminContext(request,env,{write:true});if(response)return response;
  const data=await readJson(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const a=BRIDGE.adapter(clean(data.provider,30));
  if(!a||a.id==='manual'||!BRIDGE.adapterReady(a))return json(request,env,{error:'ADAPTER_NOT_READY'},409);
  const parsed=BRIDGE.parseResult(a,data.params||{});
  if(!parsed)return json(request,env,{error:'INVALID_TERMINAL_RESULT'},400);
  const row=await env.DB.prepare(`SELECT ${COLUMNS} FROM store_terminal_payments WHERE store_slug=? AND request_key=? AND provider=?`).bind(ctx.subject.key,parsed.requestKey,a.id).first();
  if(!row)return json(request,env,{error:'PAYMENT_NOT_FOUND'},404);
  if(row.status===parsed.status)return json(request,env,{ok:true,idempotent:true,payment:row});
  if(parsed.amount!=null&&Number(parsed.amount)!==Number(row.amount))return json(request,env,{error:'AMOUNT_MISMATCH'},409);
  return transition(request,env,ctx,row,parsed.status,parsed.approvalNo);
}

export async function handleStoreTerminalPaymentApi(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/v1/store-terminal/'))return null;
  const {allowed,headers}=cors(request,env);
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers});
  if(!allowed)return json(request,env,{error:'ORIGIN_FORBIDDEN'},403);
  if(!env?.DB)return json(request,env,{error:'DATABASE_UNAVAILABLE'},503);
  if(url.pathname==='/v1/store-terminal/payments'){
    if(request.method==='GET')return listPayments(request,env);
    if(request.method==='POST')return createPayment(request,env);
  }
  if(url.pathname==='/v1/store-terminal/results'&&request.method==='POST')return recordResult(request,env);
  const match=url.pathname.match(/^\/v1\/store-terminal\/payments\/(\d+)\/actions$/);
  if(match&&request.method==='POST')return actOnPayment(request,env,toId(match[1]));
  return json(request,env,{error:'NOT_FOUND'},404);
}
