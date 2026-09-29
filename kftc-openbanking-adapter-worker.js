import {decryptKftcCredential,encryptKftcCredential,kftcCredentialReady,kftcStateHash,randomKftcToken} from './money/kftc-credential-vault.js';

const BALANCE_URL='https://openapi.openbanking.or.kr/v2.0/account/balance/fin_num';
const TRANSACTION_URL='https://openapi.openbanking.or.kr/v2.0/account/transaction_list/fin_num';
const CANONICAL_REDIRECT='https://ekodi.kr/money/oauth/kftc/callback';
const clean=(value,max=300)=>String(value??'').trim().slice(0,max);
const enabled=value=>String(value||'').toLowerCase()==='true';
const nowIso=()=>new Date().toISOString();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
async function body(request){try{return await request.json()}catch{return null}}
function config(env={}){
  const storageReady=Boolean(env.DB)&&kftcCredentialReady(env);
  const contractApproved=enabled(env.KFTC_OPENBANKING_CONTRACT_APPROVED);
  const liveReadEnabled=enabled(env.KFTC_OPENBANKING_LIVE_READ_ENABLED);
  const clientConfigured=Boolean(clean(env.KFTC_OPENBANKING_CLIENT_ID,300)&&clean(env.KFTC_OPENBANKING_CLIENT_SECRET,300));
  const redirectConfigured=clean(env.KFTC_OPENBANKING_REDIRECT_URI,500)===CANONICAL_REDIRECT;
  const bankTranPrefix=clean(env.KFTC_BANK_TRAN_ID_PREFIX,20).toUpperCase();
  const internalAuthConfigured=Boolean(clean(env.KFTC_INTERNAL_SERVICE_TOKEN,500));
  return{storageReady,contractApproved,liveReadEnabled,clientConfigured,redirectConfigured,bankTranPrefixConfigured:Boolean(bankTranPrefix),internalAuthConfigured,readReady:storageReady&&contractApproved&&liveReadEnabled&&clientConfigured&&redirectConfigured&&Boolean(bankTranPrefix)&&internalAuthConfigured};
}
async function sameSecret(a,b){if(!a||!b)return false;const enc=new TextEncoder();const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);const xb=new Uint8Array(x),yb=new Uint8Array(y);if(xb.length!==yb.length)return false;let diff=0;for(let i=0;i<xb.length;i++)diff|=xb[i]^yb[i];return diff===0}
async function internalAuthorized(request,env){return sameSecret(clean(request.headers.get('x-ekodi-banking-service-token'),500),clean(env.KFTC_INTERNAL_SERVICE_TOKEN,500))}
function kstParts(date=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(parts.map(p=>[p.type,p.value]))}
function tranDtime(date=new Date()){const p=kstParts(date);return`${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`}
function day(date){const p=kstParts(date);return`${p.year}${p.month}${p.day}`}
function bankTranId(env){const prefix=clean(env.KFTC_BANK_TRAN_ID_PREFIX,20).toUpperCase();if(!prefix||prefix.length>=20)return prefix.length===20?prefix:'';const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';const bytes=crypto.getRandomValues(new Uint8Array(20-prefix.length));let suffix='';for(const b of bytes)suffix+=alphabet[b%alphabet.length];return(prefix+suffix).slice(0,20)}
function ensureKftcOk(data){if(String(data?.rsp_code||'')!=='A0000')throw Object.assign(new Error(clean(data?.rsp_message||'KFTC_API_ERROR',300)),{code:clean(data?.rsp_code||'KFTC_API_ERROR',40)});if(data?.bank_rsp_code&&String(data.bank_rsp_code)!=='000')throw Object.assign(new Error(clean(data?.bank_rsp_message||'KFTC_BANK_ERROR',300)),{code:clean(data?.bank_rsp_code,40)});return data}
async function kftcGet(url,token){const response=await fetch(url,{headers:{authorization:`Bearer ${token}`,accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000)});const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(clean(data?.rsp_message||`KFTC_HTTP_${response.status}`,300)),{code:`HTTP_${response.status}`});return ensureKftcOk(data)}
function dateTimeIso(dateValue,timeValue){const d=String(dateValue||'');const t=String(timeValue||'').padEnd(6,'0');if(!/^\d{8}$/.test(d)||!/^\d{6}$/.test(t))return nowIso();const iso=`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}+09:00`;return new Date(iso).toISOString()}
export function normalizeKftcSync(balance,transactions){
  const rows=Array.isArray(transactions?.res_list)?transactions.res_list:[];
  return{
    account:{balance:Number(balance?.balance_amt||transactions?.balance_amt||0),availableBalance:Number(balance?.available_amt||balance?.balance_amt||transactions?.balance_amt||0),asOf:nowIso()},
    transactions:rows.map((item,index)=>({
      externalId:clean(item?.bank_tran_id||`${transactions?.api_tran_id||'kftc'}:${item?.tran_date||''}:${item?.tran_time||''}:${index}`,200),
      bookedAt:dateTimeIso(item?.tran_date,item?.tran_time),
      valueDate:item?.tran_date?dateTimeIso(item.tran_date,'000000'):null,
      direction:String(item?.inout_type||'').includes('입금')?'in':'out',
      amount:Math.abs(Number(item?.tran_amt||0)),
      balanceAfter:Number.isFinite(Number(item?.after_balance_amt))?Number(item.after_balance_amt):null,
      description:clean(item?.printed_content||item?.print_content||item?.tran_type||'',300),
      counterpartyName:'',
      category:clean(item?.tran_type||'',80)
    })).filter(item=>item.amount>0)
  };
}
async function audit(env,connectionId,actorUserId,action,result,detail=''){try{await env.DB.prepare('INSERT INTO money_kftc_audit(connection_id,actor_user_id,action,result,detail,created_at) VALUES(?,?,?,?,?,?)').bind(connectionId||null,actorUserId||'',clean(action,100),clean(result,80),clean(detail,500),nowIso()).run()}catch(error){console.error('kftc audit failed',error)}}
async function sync(request,env){
  if(!await internalAuthorized(request,env))return json({ok:false,error:config(env).internalAuthConfigured?'unauthorized':'internal_auth_unconfigured'},config(env).internalAuthConfigured?401:503);
  const readiness=config(env);if(!readiness.readReady)return json({ok:false,error:'kftc_read_not_ready',readiness,financialExecution:false},503);
  const input=await body(request)||{};const connectionId=clean(input.accountRef||input.connectionId,160);if(!connectionId)return json({ok:false,error:'account_ref_required'},400);
  const row=await env.DB.prepare("SELECT * FROM money_kftc_connections WHERE id=? AND status='active'").bind(connectionId).first();if(!row)return json({ok:false,error:'kftc_connection_not_found'},404);
  let credential;try{credential=await decryptKftcCredential(env,row)}catch(error){await audit(env,connectionId,row.actor_user_id,'sync','decrypt_failed',error.message);return json({ok:false,error:'kftc_credential_unavailable'},503)}
  const token=clean(credential?.accessToken,5000);const fintechUseNum=clean(credential?.fintechUseNum,30);if(!token||!/^\d{24}$/.test(fintechUseNum))return json({ok:false,error:'kftc_connection_incomplete'},409);
  const transactionId1=bankTranId(env),transactionId2=bankTranId(env);if(!transactionId1||!transactionId2)return json({ok:false,error:'kftc_bank_tran_id_prefix_required'},503);
  const now=new Date(),from=new Date(now.getTime()-7*86400000);
  try{
    const balanceUrl=new URL(BALANCE_URL);balanceUrl.searchParams.set('fintech_use_num',fintechUseNum);balanceUrl.searchParams.set('bank_tran_id',transactionId1);balanceUrl.searchParams.set('tran_dtime',tranDtime(now));
    const txUrl=new URL(TRANSACTION_URL);for(const [k,v] of Object.entries({bank_tran_id:transactionId2,fintech_use_num:fintechUseNum,inquiry_type:'A',inquiry_base:'D',from_date:day(from),from_time:'000000',to_date:day(now),to_time:'235959',sort_order:'D',tran_dtime:tranDtime(now)}))txUrl.searchParams.set(k,v);
    const [balance,transactions]=await Promise.all([kftcGet(balanceUrl,token),kftcGet(txUrl,token)]);
    const normalized=normalizeKftcSync(balance,transactions);await env.DB.prepare('UPDATE money_kftc_connections SET last_used_at=?,updated_at=? WHERE id=?').bind(nowIso(),nowIso(),connectionId).run();await audit(env,connectionId,row.actor_user_id,'sync','ok',`transactions=${normalized.transactions.length}`);return json(normalized);
  }catch(error){await audit(env,connectionId,row.actor_user_id,'sync','failed',`${error.code||''}:${error.message||''}`);return json({ok:false,error:'kftc_sync_failed',providerCode:clean(error.code,40)},502)}
}
async function importConnection(request,env){
  if(!await internalAuthorized(request,env))return json({ok:false,error:config(env).internalAuthConfigured?'unauthorized':'internal_auth_unconfigured'},config(env).internalAuthConfigured?401:503);
  if(!enabled(env.KFTC_CONNECTION_IMPORT_ENABLED))return json({ok:false,error:'connection_import_disabled'},403);
  if(!kftcCredentialReady(env)||!env.DB)return json({ok:false,error:'credential_store_not_ready'},503);
  const input=await body(request)||{};const accessToken=clean(input.accessToken,5000),fintechUseNum=clean(input.fintechUseNum,30),actorUserId=clean(input.actorUserId,160),scope=clean(input.scope||'inquiry',120);
  if(!accessToken||!/^\d{24}$/.test(fintechUseNum)||!actorUserId||!scope.split(/\s+/).includes('inquiry'))return json({ok:false,error:'invalid_read_connection'},400);
  const id=`kftc_${crypto.randomUUID()}`;const encrypted=await encryptKftcCredential(env,{accessToken,fintechUseNum,refreshToken:clean(input.refreshToken,5000),tokenType:clean(input.tokenType||'Bearer',40),scope,expiresAt:clean(input.expiresAt,80)});const now=nowIso();
  await env.DB.prepare(`INSERT INTO money_kftc_connections(id,actor_user_id,actor_email,workspace_key,credential_ciphertext,credential_iv,granted_scope,status,consented_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'active',?,?,?)`).bind(id,actorUserId,clean(input.actorEmail,240).toLowerCase(),clean(input.workspace,100).toLowerCase(),encrypted.ciphertext,encrypted.iv,scope,clean(input.consentedAt||now,80),now,now).run();
  await audit(env,id,actorUserId,'connection.import','ok','read-only');return json({ok:true,id,status:'active',readOnly:true,financialExecution:false},201);
}
async function revokeConnection(request,env){
  if(!await internalAuthorized(request,env))return json({ok:false,error:config(env).internalAuthConfigured?'unauthorized':'internal_auth_unconfigured'},config(env).internalAuthConfigured?401:503);
  const input=await body(request)||{};const id=clean(input.connectionId,160);if(!id)return json({ok:false,error:'connection_id_required'},400);const now=nowIso();const row=await env.DB.prepare('SELECT actor_user_id FROM money_kftc_connections WHERE id=?').bind(id).first();if(!row)return json({ok:false,error:'kftc_connection_not_found'},404);
  await env.DB.prepare("UPDATE money_kftc_connections SET credential_ciphertext='',credential_iv='',status='revoked',revoked_at=?,updated_at=? WHERE id=?").bind(now,now,id).run();await audit(env,id,row.actor_user_id,'connection.revoke','ok');return json({ok:true,status:'revoked'});
}
export default{async fetch(request,env){const url=new URL(request.url);if(request.method==='GET'&&url.pathname==='/health'){const readiness=config(env);return json({ok:true,service:'ekodi-kftc-openbanking-adapter',version:1,mode:'read-only',...readiness,oauthFlowReady:false,financialExecution:false,transferExecution:false,rawAccountNumberCollection:false,canonicalRedirectUri:CANONICAL_REDIRECT})}if(request.method==='POST'&&url.pathname==='/sync')return sync(request,env);if(request.method==='POST'&&url.pathname==='/internal/connections')return importConnection(request,env);if(request.method==='POST'&&url.pathname==='/internal/revoke')return revokeConnection(request,env);if(url.pathname.startsWith('/oauth/'))return json({ok:false,error:'kftc_oauth_flow_pending_contract_spec_lock',financialExecution:false},501);return json({ok:false,error:'not_found'},404)}};
