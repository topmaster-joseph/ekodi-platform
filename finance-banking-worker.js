import authWorker from './auth-worker.js';
import { TENANT_ADMIN_CAPABILITIES, tenantAdminCan } from './tenant-admin-policy.js';

const CENTRAL_SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const CENTRAL_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const CHURCH_PASTOR_API='https://renzehysxirjilvdxacv.supabase.co/functions/v1/church-pastor-api';
const ALLOWED_ORIGINS=new Set(['https://ekodi.kr']);
const WORKSPACE_ALIASES=Object.freeze({
  'ekodi-church':'ekodichurch','ekodichurch':'ekodichurch',
  'ekodi-biz':'ekodibiz','ekodibiz':'ekodibiz',
  'ekodi-trade':'ekoditrade','ekoditrade':'ekoditrade',
  'cheonggye':'cgma','cgma':'cgma',
  'ekodi-mission':'ekodimission','ekodimission':'ekodimission',
  'ekodi-lab':'ekodilab','ekodilab':'ekodilab','ekodimall':'ekodimall'
});
const nowIso=()=>new Date().toISOString();
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const toPositiveInt=(value,max=Number.MAX_SAFE_INTEGER)=>{const n=Math.trunc(Number(value));return Number.isSafeInteger(n)&&n>0&&n<=max?n:0};
const tokenFrom=request=>{const raw=String(request.headers.get('authorization')||'');return raw.toLowerCase().startsWith('bearer ')?raw.slice(7).trim():''};
const uid=prefix=>`${prefix}_${crypto.randomUUID()}`;
const workspaceKey=value=>{const raw=clean(value,100).toLowerCase().replace(/^\/+|\/+$/g,'');return WORKSPACE_ALIASES[raw]||raw};

function cors(origin=''){
  const headers=new Headers({
    'access-control-allow-headers':'authorization, content-type, idempotency-key, x-ekodi-workspace',
    'access-control-allow-methods':'GET, POST, PATCH, OPTIONS',
    'access-control-max-age':'86400',vary:'Origin'
  });
  if(origin&&ALLOWED_ORIGINS.has(origin))headers.set('access-control-allow-origin',origin);
  return headers;
}
function json(data,status=200,origin='',baseHeaders=null){
  const headers=new Headers(baseHeaders||{});
  headers.set('content-type','application/json; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('x-content-type-options','nosniff');
  headers.set('referrer-policy','no-referrer');
  for(const [key,value] of cors(origin).entries())headers.set(key,value);
  return new Response(JSON.stringify(data),{status,headers});
}
async function body(request){try{return await request.json()}catch{return null}}

async function platformSession(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return null;
  const session=await response.json().catch(()=>null);
  return session?.authenticated?session:null;
}
async function centralIdentity(request){
  const token=tokenFrom(request);if(!token||token.length>8192)return null;
  const response=await fetch(`${CENTRAL_SUPABASE_URL}/auth/v1/user`,{
    headers:{apikey:CENTRAL_PUBLISHABLE_KEY,authorization:`Bearer ${token}`},
    cache:'no-store',signal:AbortSignal.timeout(10000)
  }).catch(()=>null);
  if(!response?.ok)return null;
  const user=await response.json().catch(()=>null);
  if(!user?.id||!user?.email||!user?.email_confirmed_at)return null;
  return{id:String(user.id),email:String(user.email).trim().toLowerCase(),token};
}
async function currentWorkspaceRole(identity,key){
  const response=await fetch(`${CENTRAL_SUPABASE_URL}/rest/v1/rpc/current_site_activity_contexts`,{
    method:'POST',
    headers:{apikey:CENTRAL_PUBLISHABLE_KEY,authorization:`Bearer ${identity.token}`,'content-type':'application/json'},
    body:'{}',cache:'no-store',signal:AbortSignal.timeout(10000)
  }).catch(()=>null);
  if(!response?.ok)return null;
  const rows=await response.json().catch(()=>[]);
  const target=workspaceKey(key);
  const row=(Array.isArray(rows)?rows:[]).find(item=>{
    const candidates=[item?.tenant,item?.workspace_key].map(workspaceKey).filter(Boolean);
    return candidates.includes(target);
  });
  if(!row)return null;
  return clean(row.authorization_role||row.role,80).toLowerCase();
}
async function churchFinanceAccess(identity){
  const url=new URL(CHURCH_PASTOR_API);url.searchParams.set('scope','finance-access');
  const response=await fetch(url,{
    headers:{apikey:CENTRAL_PUBLISHABLE_KEY,authorization:`Bearer ${identity.token}`},
    cache:'no-store',signal:AbortSignal.timeout(10000)
  }).catch(()=>null);
  if(!response?.ok)return null;
  const data=await response.json().catch(()=>null);
  if(!data?.ok||!data?.role)return null;
  return clean(data.role,80).toLowerCase();
}
async function organizationForWorkspace(env,key){
  const normalized=workspaceKey(key);
  if(!normalized)return null;
  const row=await env.DB.prepare(`SELECT organization_id AS organizationId
    FROM workspace_organization_links WHERE workspace_key=? AND active=1`).bind(normalized).first();
  return row?{workspace:normalized,organizationId:String(row.organizationId)}:null;
}
async function resolveActor(request,env,url){
  const platform=await platformSession(request,env);
  if(platform){
    const requestedOrg=clean(url.searchParams.get('organizationId'),80);
    return{
      actorType:'platform_admin',email:clean(platform.email,240).toLowerCase(),subjectId:'',role:clean(platform.role||'admin',80).toLowerCase(),
      platform:true,canRead:true,canManage:true,canApprove:true,canExecute:true,workspace:'',organizationId:requestedOrg||null
    };
  }
  const identity=await centralIdentity(request);if(!identity)return null;
  const requestedWorkspace=workspaceKey(
    url.searchParams.get('workspace')||request.headers.get('x-ekodi-workspace')||''
  );
  if(!requestedWorkspace)return null;
  let role='';
  if(requestedWorkspace==='ekodichurch')role=await churchFinanceAccess(identity)||'';
  else role=await currentWorkspaceRole(identity,requestedWorkspace)||'';
  if(!role)return null;
  const canRead=tenantAdminCan(role,TENANT_ADMIN_CAPABILITIES.finance)||tenantAdminCan(role,TENANT_ADMIN_CAPABILITIES.financeManage);
  const canManage=tenantAdminCan(role,TENANT_ADMIN_CAPABILITIES.financeManage);
  if(!canRead)return null;
  const scope=await organizationForWorkspace(env,requestedWorkspace);if(!scope)return null;
  return{
    actorType:'tenant_admin',email:identity.email,subjectId:identity.id,role,platform:false,
    canRead,canManage,canApprove:canManage,canExecute:canManage,
    workspace:scope.workspace,organizationId:scope.organizationId
  };
}
async function audit(env,actor,action,resourceType,resourceId='',detail=''){
  try{
    await env.DB.prepare(`INSERT INTO bank_audit_log
      (organization_id,workspace_key,actor_type,actor_email,actor_subject_id,actor_role,action,resource_type,resource_id,detail,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(actor.organizationId||null,actor.workspace||'',actor.actorType,actor.email||'',actor.subjectId||'',actor.role||'',
        clean(action,120),clean(resourceType,80),clean(resourceId,160),clean(detail,500),nowIso()).run();
  }catch(error){console.error('finance banking audit failed',error)}
}
function orgClause(actor,alias=''){
  const col=alias?`${alias}.organization_id`:'organization_id';
  return actor.organizationId?{sql:` WHERE ${col}=?`,bind:[actor.organizationId]}:{sql:'',bind:[]};
}
async function bankingOverview(env,actor){
  const scope=orgClause(actor);
  const [accountSummary,accounts,transactions,transfers]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS accounts,
      COALESCE(SUM(CASE WHEN current_balance IS NOT NULL THEN current_balance ELSE 0 END),0) AS balance,
      COALESCE(SUM(CASE WHEN connection_status='active' THEN 1 ELSE 0 END),0) AS active
      FROM bank_connections${scope.sql}`).bind(...scope.bind).first(),
    env.DB.prepare(`SELECT id,organization_id AS organizationId,workspace_key AS workspace,provider,institution_code AS institutionCode,
      institution_name AS institutionName,account_alias AS accountAlias,account_type AS accountType,account_last4 AS accountLast4,
      currency,current_balance AS currentBalance,available_balance AS availableBalance,balance_as_of AS balanceAsOf,
      connection_status AS connectionStatus,read_enabled AS readEnabled,transfer_enabled AS transferEnabled,updated_at AS updatedAt
      FROM bank_connections${scope.sql} ORDER BY organization_id,account_alias`).bind(...scope.bind).all(),
    env.DB.prepare(`SELECT t.id,t.bank_connection_id AS bankConnectionId,t.organization_id AS organizationId,t.booked_at AS bookedAt,
      t.direction,t.amount,t.balance_after AS balanceAfter,t.description,t.counterparty_name AS counterpartyName,t.category,t.source_type AS sourceType
      FROM bank_transactions t${orgClause(actor,'t').sql} ORDER BY t.booked_at DESC LIMIT 50`)
      .bind(...orgClause(actor,'t').bind).all(),
    env.DB.prepare(`SELECT r.id,r.organization_id AS organizationId,r.workspace_key AS workspace,r.bank_connection_id AS bankConnectionId,
      r.requester_email AS requesterEmail,r.requester_role AS requesterRole,r.recipient_bank_name AS recipientBankName,
      r.recipient_name AS recipientName,r.recipient_account_last4 AS recipientAccountLast4,r.amount,r.currency,r.memo,r.status,
      r.required_approvals AS requiredApprovals,r.approval_count AS approvalCount,r.provider_transfer_ref AS providerTransferRef,
      r.failure_code AS failureCode,r.requested_at AS requestedAt,r.approved_at AS approvedAt,r.executed_at AS executedAt
      FROM transfer_requests r${orgClause(actor,'r').sql} ORDER BY r.requested_at DESC LIMIT 50`)
      .bind(...orgClause(actor,'r').bind).all()
  ]);
  return{
    generatedAt:nowIso(),
    scope:{workspace:actor.workspace||null,organizationId:actor.organizationId||null,platform:actor.platform},
    capabilities:{read:actor.canRead,manage:actor.canManage,approve:actor.canApprove,execute:actor.canExecute},
    readiness:{
      readerConnected:Boolean(env.BANKING_READER&&typeof env.BANKING_READER.fetch==='function'),
      executorConnected:Boolean(env.BANKING_EXECUTOR&&typeof env.BANKING_EXECUTOR.fetch==='function'),
      transferExecutionEnabled:String(env.BANKING_TRANSFER_ENABLED||'').toLowerCase()==='true'
    },
    summary:{accounts:Number(accountSummary?.accounts||0),activeAccounts:Number(accountSummary?.active||0),currentBalance:Number(accountSummary?.balance||0),
      pendingTransfers:(transfers.results||[]).filter(item=>['requested','approved','executing'].includes(item.status)).length},
    accounts:accounts.results||[],transactions:transactions.results||[],transfers:transfers.results||[]
  };
}
async function createConnection(env,actor,input){
  if(!actor.platform)throw Object.assign(new Error('PLATFORM_ADMIN_REQUIRED'),{status:403});
  const organizationId=clean(input?.organizationId||actor.organizationId,80);
  const alias=clean(input?.accountAlias,120);
  if(!organizationId||!alias)throw Object.assign(new Error('ORGANIZATION_AND_ALIAS_REQUIRED'),{status:400});
  const org=await env.DB.prepare('SELECT id FROM organizations WHERE id=? AND active=1').bind(organizationId).first();
  if(!org)throw Object.assign(new Error('ORGANIZATION_NOT_FOUND'),{status:404});
  const id=uid('bank');
  const last4=clean(input?.accountLast4,4).replace(/\D/g,'').slice(-4);
  const accountRef=clean(input?.accountRef,240);
  const provider=clean(input?.provider||'MANUAL',40).toUpperCase();
  const status=['pending','active','disconnected','error'].includes(input?.connectionStatus)?input.connectionStatus:'pending';
  const now=nowIso();
  await env.DB.prepare(`INSERT INTO bank_connections
    (id,organization_id,workspace_key,provider,institution_code,institution_name,account_alias,account_type,account_ref,account_last4,
     currency,current_balance,available_balance,balance_as_of,connection_status,read_enabled,transfer_enabled,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,organizationId,workspaceKey(input?.workspace||''),provider,clean(input?.institutionCode,40),clean(input?.institutionName,120),
      alias,clean(input?.accountType||'checking',40),accountRef,last4,clean(input?.currency||'KRW',8),
      Number.isFinite(Number(input?.currentBalance))?Math.trunc(Number(input.currentBalance)):null,
      Number.isFinite(Number(input?.availableBalance))?Math.trunc(Number(input.availableBalance)):null,
      input?.balanceAsOf?clean(input.balanceAsOf,40):null,status,input?.readEnabled===false?0:1,input?.transferEnabled===true?1:0,now,now).run();
  const scoped={...actor,organizationId};
  await audit(env,scoped,'bank.connection.create','bank_connection',id,JSON.stringify({provider,alias,last4,status}));
  return id;
}
async function importTransactions(env,actor,input){
  if(!actor.canManage)throw Object.assign(new Error('FINANCE_MANAGE_REQUIRED'),{status:403});
  const connectionId=clean(input?.bankConnectionId,160);
  const connection=await env.DB.prepare(`SELECT id,organization_id AS organizationId FROM bank_connections WHERE id=?`).bind(connectionId).first();
  if(!connection||actor.organizationId&&String(connection.organizationId)!==actor.organizationId)throw Object.assign(new Error('BANK_CONNECTION_NOT_FOUND'),{status:404});
  const rows=Array.isArray(input?.transactions)?input.transactions.slice(0,500):[];
  if(!rows.length)throw Object.assign(new Error('TRANSACTIONS_REQUIRED'),{status:400});
  let imported=0;const now=nowIso();
  for(const item of rows){
    const amount=toPositiveInt(item?.amount);
    const direction=item?.direction==='in'?'in':item?.direction==='out'?'out':'';
    const bookedAt=clean(item?.bookedAt,40);const externalId=clean(item?.externalId,200);
    if(!amount||!direction||!bookedAt||!externalId)continue;
    const id=uid('txn');
    await env.DB.prepare(`INSERT INTO bank_transactions
      (id,bank_connection_id,organization_id,external_id,booked_at,value_date,direction,amount,balance_after,description,counterparty_name,category,source_type,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(bank_connection_id,external_id) DO UPDATE SET
        booked_at=excluded.booked_at,value_date=excluded.value_date,direction=excluded.direction,amount=excluded.amount,
        balance_after=excluded.balance_after,description=excluded.description,counterparty_name=excluded.counterparty_name,
        category=excluded.category,updated_at=excluded.updated_at`)
      .bind(id,connectionId,String(connection.organizationId),externalId,bookedAt,item?.valueDate?clean(item.valueDate,40):null,direction,amount,
        Number.isFinite(Number(item?.balanceAfter))?Math.trunc(Number(item.balanceAfter)):null,clean(item?.description,300),
        clean(item?.counterpartyName,160),clean(item?.category,80),'import',now,now).run();
    imported++;
  }
  const scoped={...actor,organizationId:String(connection.organizationId)};
  await audit(env,scoped,'bank.transactions.import','bank_connection',connectionId,`rows=${imported}`);
  return imported;
}
async function syncConnection(env,actor,connectionId){
  if(!actor.canManage)throw Object.assign(new Error('FINANCE_MANAGE_REQUIRED'),{status:403});
  const connection=await env.DB.prepare(`SELECT * FROM bank_connections WHERE id=?`).bind(connectionId).first();
  if(!connection||actor.organizationId&&String(connection.organization_id)!==actor.organizationId)throw Object.assign(new Error('BANK_CONNECTION_NOT_FOUND'),{status:404});
  if(!env.BANKING_READER||typeof env.BANKING_READER.fetch!=='function')throw Object.assign(new Error('BANKING_READER_NOT_CONNECTED'),{status:503});
  if(!connection.account_ref)throw Object.assign(new Error('BANK_ACCOUNT_REF_REQUIRED'),{status:409});
  const response=await env.BANKING_READER.fetch('https://banking.internal/sync',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({connectionId:connection.id,organizationId:connection.organization_id,provider:connection.provider,accountRef:connection.account_ref})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||'BANKING_SYNC_FAILED'),{status:502});
  const now=nowIso();
  const account=data.account||{};
  await env.DB.prepare(`UPDATE bank_connections SET current_balance=?,available_balance=?,balance_as_of=?,connection_status='active',updated_at=? WHERE id=?`)
    .bind(Number.isFinite(Number(account.balance))?Math.trunc(Number(account.balance)):connection.current_balance,
      Number.isFinite(Number(account.availableBalance))?Math.trunc(Number(account.availableBalance)):connection.available_balance,
      clean(account.asOf||now,40),now,connection.id).run();
  const imported=await importTransactions(env,{...actor,organizationId:String(connection.organization_id),canManage:true},{bankConnectionId:connection.id,transactions:(data.transactions||[]).map(item=>({...item,externalId:item.externalId||item.id}))});
  await audit(env,{...actor,organizationId:String(connection.organization_id)},'bank.connection.sync','bank_connection',connection.id,`rows=${imported}`);
  return{imported};
}
async function createTransfer(env,actor,input,request){
  if(!actor.canManage)throw Object.assign(new Error('FINANCE_MANAGE_REQUIRED'),{status:403});
  const connectionId=clean(input?.bankConnectionId,160);
  const connection=await env.DB.prepare(`SELECT id,organization_id AS organizationId,workspace_key AS workspaceKey,transfer_enabled AS transferEnabled
    FROM bank_connections WHERE id=?`).bind(connectionId).first();
  if(!connection||actor.organizationId&&String(connection.organizationId)!==actor.organizationId)throw Object.assign(new Error('BANK_CONNECTION_NOT_FOUND'),{status:404});
  const amount=toPositiveInt(input?.amount,1000000000000);
  const recipientName=clean(input?.recipientName,120);
  if(!amount||!recipientName)throw Object.assign(new Error('TRANSFER_INPUT_REQUIRED'),{status:400});
  const last4=clean(input?.recipientAccountLast4,8).replace(/\D/g,'').slice(-4);
  const ref=clean(input?.recipientAccountRef,240);
  if(!last4&&!ref)throw Object.assign(new Error('RECIPIENT_ACCOUNT_REFERENCE_REQUIRED'),{status:400});
  const idempotency=clean(request.headers.get('idempotency-key')||input?.idempotencyKey,160)||null;
  if(idempotency){
    const existing=await env.DB.prepare(`SELECT id,status FROM transfer_requests WHERE organization_id=? AND idempotency_key=?`)
      .bind(String(connection.organizationId),idempotency).first();
    if(existing)return{existing:true,id:String(existing.id),status:String(existing.status)};
  }
  const id=uid('transfer');const now=nowIso();
  await env.DB.prepare(`INSERT INTO transfer_requests
    (id,organization_id,workspace_key,bank_connection_id,requester_email,requester_subject_id,requester_role,
     recipient_bank_name,recipient_name,recipient_account_ref,recipient_account_last4,amount,currency,memo,status,
     required_approvals,approval_count,idempotency_key,requested_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'requested',1,0,?,?,?,?)`)
    .bind(id,String(connection.organizationId),actor.workspace||String(connection.workspaceKey||''),connectionId,actor.email||'',
      actor.subjectId||'',actor.role||'',clean(input?.recipientBankName,120),recipientName,ref,last4,amount,clean(input?.currency||'KRW',8),
      clean(input?.memo,500),idempotency,now,now,now).run();
  await audit(env,{...actor,organizationId:String(connection.organizationId)},'transfer.request','transfer_request',id,
    JSON.stringify({connectionId,amount,currency:clean(input?.currency||'KRW',8),recipientBankName:clean(input?.recipientBankName,120),recipientName,last4}));
  return{existing:false,id,status:'requested'};
}
async function transferById(env,actor,id){
  const row=await env.DB.prepare(`SELECT * FROM transfer_requests WHERE id=?`).bind(id).first();
  if(!row||actor.organizationId&&String(row.organization_id)!==actor.organizationId)return null;
  return row;
}
async function approveTransfer(env,actor,id,input){
  if(!actor.canApprove)throw Object.assign(new Error('FINANCE_APPROVAL_REQUIRED'),{status:403});
  const transfer=await transferById(env,actor,id);if(!transfer)throw Object.assign(new Error('TRANSFER_NOT_FOUND'),{status:404});
  if(transfer.status!=='requested')throw Object.assign(new Error('TRANSFER_NOT_REQUESTED'),{status:409});
  if(!actor.platform&&String(transfer.requester_email||'').toLowerCase()===String(actor.email||'').toLowerCase())
    throw Object.assign(new Error('SELF_APPROVAL_NOT_ALLOWED'),{status:409});
  const now=nowIso();
  try{
    await env.DB.prepare(`INSERT INTO transfer_approvals
      (transfer_request_id,organization_id,action,actor_email,actor_subject_id,actor_role,reason,created_at)
      VALUES (?,?,?,?,?,?,?,?)`)
      .bind(id,String(transfer.organization_id),'approve',actor.email||'',actor.subjectId||'',actor.role||'',clean(input?.reason,500),now).run();
  }catch(error){
    if(String(error?.message||'').toLowerCase().includes('unique'))throw Object.assign(new Error('APPROVAL_ALREADY_RECORDED'),{status:409});
    throw error;
  }
  const countRow=await env.DB.prepare(`SELECT COUNT(*) AS count FROM transfer_approvals WHERE transfer_request_id=? AND action='approve'`).bind(id).first();
  const count=Number(countRow?.count||0),required=Number(transfer.required_approvals||1);
  const status=count>=required?'approved':'requested';
  await env.DB.prepare(`UPDATE transfer_requests SET approval_count=?,status=?,approved_at=?,updated_at=? WHERE id=?`)
    .bind(count,status,status==='approved'?now:null,now,id).run();
  await audit(env,{...actor,organizationId:String(transfer.organization_id)},'transfer.approve','transfer_request',id,`count=${count}/${required}`);
  return{status,approvalCount:count,requiredApprovals:required};
}
async function rejectTransfer(env,actor,id,input){
  if(!actor.canApprove)throw Object.assign(new Error('FINANCE_APPROVAL_REQUIRED'),{status:403});
  const transfer=await transferById(env,actor,id);if(!transfer)throw Object.assign(new Error('TRANSFER_NOT_FOUND'),{status:404});
  if(!['requested','approved'].includes(transfer.status))throw Object.assign(new Error('TRANSFER_NOT_REJECTABLE'),{status:409});
  const now=nowIso();
  await env.DB.prepare(`INSERT OR REPLACE INTO transfer_approvals
    (id,transfer_request_id,organization_id,action,actor_email,actor_subject_id,actor_role,reason,created_at)
    VALUES ((SELECT id FROM transfer_approvals WHERE transfer_request_id=? AND actor_email=?),?,?,?,?,?,?,?,?)`)
    .bind(id,actor.email||'',id,String(transfer.organization_id),'reject',actor.email||'',actor.subjectId||'',actor.role||'',clean(input?.reason,500),now).run();
  await env.DB.prepare(`UPDATE transfer_requests SET status='rejected',failure_code='REJECTED',updated_at=? WHERE id=?`).bind(now,id).run();
  await audit(env,{...actor,organizationId:String(transfer.organization_id)},'transfer.reject','transfer_request',id,clean(input?.reason,300));
  return{status:'rejected'};
}
async function executeTransfer(env,actor,id,input){
  if(!actor.canExecute)throw Object.assign(new Error('FINANCE_EXECUTION_REQUIRED'),{status:403});
  const transfer=await transferById(env,actor,id);if(!transfer)throw Object.assign(new Error('TRANSFER_NOT_FOUND'),{status:404});
  if(transfer.status!=='approved')throw Object.assign(new Error('TRANSFER_NOT_APPROVED'),{status:409});
  if(String(env.BANKING_TRANSFER_ENABLED||'').toLowerCase()!=='true'||!env.BANKING_EXECUTOR||typeof env.BANKING_EXECUTOR.fetch!=='function')
    throw Object.assign(new Error('BANKING_EXECUTOR_NOT_CONNECTED'),{status:503});
  const connection=await env.DB.prepare(`SELECT id,provider,account_ref,transfer_enabled FROM bank_connections WHERE id=?`).bind(transfer.bank_connection_id).first();
  if(!connection||Number(connection.transfer_enabled)!==1||!connection.account_ref)throw Object.assign(new Error('BANK_CONNECTION_TRANSFER_DISABLED'),{status:409});
  const accountNumber=clean(input?.recipientAccountNumber,40).replace(/[^0-9]/g,'');
  if(accountNumber.length<8||accountNumber.length>20)throw Object.assign(new Error('RECIPIENT_ACCOUNT_NUMBER_REQUIRED_AT_EXECUTION'),{status:400});
  const now=nowIso();
  await env.DB.prepare(`UPDATE transfer_requests SET status='executing',updated_at=? WHERE id=?`).bind(now,id).run();
  try{
    const response=await env.BANKING_EXECUTOR.fetch('https://banking.internal/transfer',{
      method:'POST',headers:{'content-type':'application/json','idempotency-key':id},
      body:JSON.stringify({
        transferRequestId:id,provider:connection.provider,sourceAccountRef:connection.account_ref,
        recipientBankName:transfer.recipient_bank_name,recipientName:transfer.recipient_name,
        recipientAccountNumber:accountNumber,amount:Number(transfer.amount),currency:transfer.currency,memo:transfer.memo
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw Object.assign(new Error(data.error||'BANK_TRANSFER_FAILED'),{code:data.code||''});
    const executedAt=clean(data.executedAt||nowIso(),40),transferRef=clean(data.transferRef||data.id,240);
    await env.DB.prepare(`UPDATE transfer_requests SET status='completed',provider_transfer_ref=?,failure_code='',executed_at=?,updated_at=? WHERE id=?`)
      .bind(transferRef,executedAt,executedAt,id).run();
    await audit(env,{...actor,organizationId:String(transfer.organization_id)},'transfer.execute','transfer_request',id,
      JSON.stringify({amount:Number(transfer.amount),provider:connection.provider,transferRef}));
    return{status:'completed',providerTransferRef:transferRef,executedAt};
  }catch(error){
    await env.DB.prepare(`UPDATE transfer_requests SET status='failed',failure_code=?,updated_at=? WHERE id=?`)
      .bind(clean(error?.code||error?.message||'BANK_TRANSFER_FAILED',120),nowIso(),id).run();
    await audit(env,{...actor,organizationId:String(transfer.organization_id)},'transfer.execute.failed','transfer_request',id,clean(error?.message,300));
    throw Object.assign(new Error('BANK_TRANSFER_FAILED'),{status:502});
  }
}

export default{
  async fetch(request,env){
    const origin=request.headers.get('origin')||'';
    if(origin&&!ALLOWED_ORIGINS.has(origin))return json({error:'ORIGIN_FORBIDDEN'},403,origin);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
    const url=new URL(request.url);
    if(url.pathname==='/api/finance/banking/health'){
      return json({ok:true,service:'ekodi-finance-banking',schemaVersion:1,
        readerConnected:Boolean(env.BANKING_READER&&typeof env.BANKING_READER.fetch==='function'),
        executorConnected:Boolean(env.BANKING_EXECUTOR&&typeof env.BANKING_EXECUTOR.fetch==='function'),
        transferExecutionEnabled:String(env.BANKING_TRANSFER_ENABLED||'').toLowerCase()==='true'},200,origin);
    }
    if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503,origin);
    const actor=await resolveActor(request,env,url);
    if(!actor)return json({error:'FINANCE_ACCESS_REQUIRED'},401,origin);
    if(!actor.canRead)return json({error:'FINANCE_READ_REQUIRED'},403,origin);
    try{
      if(request.method==='GET'&&url.pathname==='/api/finance/banking/overview')
        return json(await bankingOverview(env,actor),200,origin);
      if(request.method==='GET'&&url.pathname==='/api/finance/banking/accounts'){
        const data=await bankingOverview(env,actor);return json({accounts:data.accounts,readiness:data.readiness,scope:data.scope,capabilities:data.capabilities},200,origin);
      }
      if(request.method==='POST'&&url.pathname==='/api/finance/banking/accounts'){
        const input=await body(request)||{};const id=await createConnection(env,actor,input);return json({ok:true,id},201,origin);
      }
      if(request.method==='GET'&&url.pathname==='/api/finance/banking/transactions'){
        const data=await bankingOverview(env,actor);return json({transactions:data.transactions,scope:data.scope},200,origin);
      }
      if(request.method==='POST'&&url.pathname==='/api/finance/banking/transactions/import'){
        const imported=await importTransactions(env,actor,await body(request)||{});return json({ok:true,imported},201,origin);
      }
      const sync=url.pathname.match(/^\/api\/finance\/banking\/accounts\/([^/]+)\/sync$/);
      if(sync&&request.method==='POST'){
        const result=await syncConnection(env,actor,decodeURIComponent(sync[1]));return json({ok:true,...result},200,origin);
      }
      if(request.method==='GET'&&url.pathname==='/api/finance/banking/transfers'){
        const data=await bankingOverview(env,actor);return json({transfers:data.transfers,scope:data.scope,capabilities:data.capabilities,readiness:data.readiness},200,origin);
      }
      if(request.method==='POST'&&url.pathname==='/api/finance/banking/transfers'){
        const result=await createTransfer(env,actor,await body(request)||{},request);return json({ok:true,...result},result.existing?200:201,origin);
      }
      let match=url.pathname.match(/^\/api\/finance\/banking\/transfers\/([^/]+)\/(approve|reject|execute)$/);
      if(match&&request.method==='POST'){
        const id=decodeURIComponent(match[1]),action=match[2],input=await body(request)||{};
        const result=action==='approve'?await approveTransfer(env,actor,id,input):action==='reject'?await rejectTransfer(env,actor,id,input):await executeTransfer(env,actor,id,input);
        return json({ok:true,...result},200,origin);
      }
      return json({error:'BANKING_ENDPOINT_NOT_FOUND'},404,origin);
    }catch(error){
      const status=Number(error?.status)||500;
      if(status>=500)console.error('finance banking error',error);
      return json({error:clean(error?.message||'FINANCE_BANKING_ERROR',240),code:'FINANCE_BANKING_ERROR'},status,origin);
    }
  }
};
