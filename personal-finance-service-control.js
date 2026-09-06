const ADMIN_ORIGIN='https://admin.ekodi.kr';
const CENTRAL_ADMIN_SESSION='https://api.ekodi.kr/api/session';
const CENTRAL_ADMIN_ELEVATION='https://api.ekodi.kr/api/admin-access/elevation';
const MUTABLE_KEYS=Object.freeze(['serviceEnabled','manualEntryEnabled','fileImportEnabled','planningEnabled']);
const LOCKED_KEYS=Object.freeze(['actionCeiling','financialExecution','aiWriteEnabled','personalDataAdminReadable','externalFinancialConnectors','safeToSpendExpectedIncome']);
const DEFAULTS=Object.freeze({serviceEnabled:true,manualEntryEnabled:true,fileImportEnabled:true,planningEnabled:true});

const clean=(value,max=500)=>String(value??'').trim().slice(0,max);
const bool=(value,fallback=true)=>value===1||value===true||value==='1'?true:value===0||value===false||value==='0'?false:fallback;
function cors(request){return request.headers.get('origin')===ADMIN_ORIGIN?{'access-control-allow-origin':ADMIN_ORIGIN,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,PUT,OPTIONS',vary:'Origin'}:{}}
function json(data,status=200,request){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...cors(request)}})}
async function readBody(request){try{return await request.json()}catch{return null}}
async function sha256(value){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));return[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('')}
function normalize(row={}){return{serviceEnabled:bool(row.service_enabled,DEFAULTS.serviceEnabled),manualEntryEnabled:bool(row.manual_entry_enabled,DEFAULTS.manualEntryEnabled),fileImportEnabled:bool(row.file_import_enabled,DEFAULTS.fileImportEnabled),planningEnabled:bool(row.planning_enabled,DEFAULTS.planningEnabled),updatedAt:row.updated_at||null}}

async function ensureConfig(db){
  const now=new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO personal_finance_service_config (id,service_enabled,manual_entry_enabled,file_import_enabled,planning_enabled,updated_at,updated_by_hash) VALUES ('global',1,1,1,1,?,'bootstrap')").bind(now).run();
}
export async function readPersonalFinanceServiceConfig(db){
  let row=await db.prepare("SELECT service_enabled,manual_entry_enabled,file_import_enabled,planning_enabled,updated_at FROM personal_finance_service_config WHERE id='global'").first();
  if(!row){await ensureConfig(db);row=await db.prepare("SELECT service_enabled,manual_entry_enabled,file_import_enabled,planning_enabled,updated_at FROM personal_finance_service_config WHERE id='global'").first()}
  return normalize(row||{});
}
async function central(request,url){
  const authorization=clean(request.headers.get('authorization'),8192);
  if(!authorization.toLowerCase().startsWith('bearer '))return{ok:false,status:401,data:{code:'PF_ADMIN_AUTH_REQUIRED'}};
  try{
    const response=await fetch(url,{headers:{authorization,accept:'application/json'},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    return{ok:response.ok,status:response.status,data};
  }catch{return{ok:false,status:503,data:{code:'PF_ADMIN_AUTH_UNAVAILABLE'}}}
}
async function adminSession(request){
  const result=await central(request,CENTRAL_ADMIN_SESSION);
  if(!result.ok||result.data?.authenticated!==true)return{...result,ok:false};
  return{...result,session:result.data};
}
async function migrationSnapshot(db){
  try{
    const row=await db.prepare('SELECT COUNT(*) AS migrationCount,MAX(name) AS latestMigration FROM d1_migrations').first();
    return{migrationCount:Number(row?.migrationCount||0),latestMigration:row?.latestMigration||null};
  }catch{return{migrationCount:null,latestMigration:null}}
}
async function snapshot(db,session){
  const [config,migration]=await Promise.all([readPersonalFinanceServiceConfig(db),migrationSnapshot(db)]);
  return{service:{id:'personal-finance',name:'개인재무',domain:'personal-finance-api.ekodi.kr',userEntry:'https://my.ekodi.kr/#money',dataBoundary:'dedicated-d1',runtimeVersion:3},config,schema:{...migration,serviceControlSchema:1},safety:{actionCeiling:'L2',financialExecution:false,aiWriteEnabled:false,personalDataAdminReadable:false,fullAccountNumberStorage:false,safeToSpendExpectedIncome:false,externalFinancialConnectors:'LOCKED'},privacy:{rawImportFileRetention:'none',ledgerOwnerScope:'person',adminLedgerAccess:'blocked'},admin:{role:clean(session?.role,40)||'viewer',canWrite:session?.role==='super_admin'}};
}
async function audit(db,session,action,detail){
  const actorHash=await sha256(String(session?.email||'unknown').trim().toLowerCase());
  await db.prepare('INSERT INTO personal_finance_service_control_audit (actor_hash,action,detail,created_at) VALUES (?,?,?,?)').bind(actorHash,action,clean(detail,500),new Date().toISOString()).run();
}
async function update(request,db,session){
  if(session?.role!=='super_admin')return json({error:'최고관리자만 개인재무 운영 설정을 변경할 수 있습니다.',code:'PF_ADMIN_FORBIDDEN'},403,request);
  const elevation=await central(request,CENTRAL_ADMIN_ELEVATION);
  if(!elevation.ok){const unavailable=elevation.status>=500;return json({error:unavailable?'추가 인증 상태를 확인할 수 없습니다.':'보호된 설정 변경에는 Google 추가 인증이 필요합니다.',code:unavailable?'PF_ADMIN_AUTH_UNAVAILABLE':'ELEVATION_REQUIRED'},unavailable?503:403,request)}
  if(elevation.data?.elevated!==true)return json({error:'보호된 설정 변경에는 Google 추가 인증이 필요합니다.',code:'ELEVATION_REQUIRED'},403,request);
  const body=await readBody(request);
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'운영 설정 형식을 확인해 주세요.',code:'PF_CONTROL_INVALID'},400,request);
  if(LOCKED_KEYS.some(key=>Object.prototype.hasOwnProperty.call(body,key)))return json({error:'안전 잠금 정책은 관리자 화면에서도 변경할 수 없습니다.',code:'PF_CONTROL_LOCKED_POLICY'},400,request);
  const unknown=Object.keys(body).filter(key=>!MUTABLE_KEYS.includes(key));
  if(unknown.length)return json({error:'지원하지 않는 운영 설정입니다.',code:'PF_CONTROL_UNKNOWN_FIELD',fields:unknown},400,request);
  const current=await readPersonalFinanceServiceConfig(db),next={...current};
  for(const key of MUTABLE_KEYS)if(Object.prototype.hasOwnProperty.call(body,key)){if(typeof body[key]!=='boolean')return json({error:'운영 설정 값은 true 또는 false여야 합니다.',code:'PF_CONTROL_INVALID_VALUE',field:key},400,request);next[key]=body[key]}
  const actorHash=await sha256(String(session.email||'').trim().toLowerCase()),now=new Date().toISOString();
  await db.prepare("UPDATE personal_finance_service_config SET service_enabled=?,manual_entry_enabled=?,file_import_enabled=?,planning_enabled=?,updated_at=?,updated_by_hash=? WHERE id='global'").bind(next.serviceEnabled?1:0,next.manualEntryEnabled?1:0,next.fileImportEnabled?1:0,next.planningEnabled?1:0,now,actorHash).run();
  await audit(db,session,'service_config.update',JSON.stringify(Object.fromEntries(MUTABLE_KEYS.map(key=>[key,next[key]]))));
  return json(await snapshot(db,session),200,request);
}
export async function handlePersonalFinanceAdminControl(request,db){
  const auth=await adminSession(request);
  if(!auth.ok){const status=auth.status===403?403:auth.status>=500?503:401;return json({error:status===503?'관리자 인증 서비스를 확인할 수 없습니다.':'EKODI 관리자 인증이 필요합니다.',code:auth.data?.code||'PF_ADMIN_AUTH_REQUIRED'},status,request)}
  if(request.method==='GET')return json(await snapshot(db,auth.session),200,request);
  if(request.method==='PUT')return update(request,db,auth.session);
  return json({error:'지원하지 않는 관리자 요청입니다.',code:'PF_ADMIN_METHOD_NOT_ALLOWED'},405,request);
}
export function personalFinanceFeatureGate(request,url,config){
  const path=url.pathname;
  if(!config.serviceEnabled)return{error:'개인재무 서비스가 운영자에 의해 일시 중지되었습니다.',code:'PF_SERVICE_PAUSED'};
  if(!config.manualEntryEnabled&&request.method==='POST'&&(path==='/api/finance/personal/accounts'||path==='/api/finance/personal/transactions'))return{error:'개인재무 수동 입력이 현재 비활성화되어 있습니다.',code:'PF_MANUAL_ENTRY_DISABLED'};
  if(!config.fileImportEnabled&&path.startsWith('/api/finance/personal/import/'))return{error:'거래 파일 가져오기가 현재 비활성화되어 있습니다.',code:'PF_IMPORT_DISABLED'};
  const planning=path==='/api/finance/personal/safe-to-spend'||path.startsWith('/api/finance/personal/planning')||path.startsWith('/api/finance/personal/recurring')||path.startsWith('/api/finance/personal/budgets')||path.startsWith('/api/finance/personal/goals');
  if(!config.planningEnabled&&planning)return{error:'개인재무 계획 엔진이 현재 비활성화되어 있습니다.',code:'PF_PLANNING_DISABLED'};
  return null;
}
export const PERSONAL_FINANCE_ADMIN_CONTROL_CONTRACT=Object.freeze({version:1,managementArea:'professional-services',personalDataAdminReadable:false,actionCeiling:'L2',financialExecution:false,aiWriteEnabled:false});
