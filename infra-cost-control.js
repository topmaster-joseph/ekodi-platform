import authWorker from './auth-worker.js';

// Task EKODI-INFRA-COST-20261026: platform-only financial operations.
// External billing credentials are never stored here. Telemetry is advisory,
// while invoices are auditable records and never inferred from usage.
const ROOT = '/api/control/infra-costs';
const PROVIDERS = Object.freeze([
  { id:'cloudflare', name:'Cloudflare', category:'호스팅·서버', consoleUrl:'https://dash.cloudflare.com/' },
  { id:'supabase', name:'Supabase', category:'데이터베이스', consoleUrl:'https://supabase.com/dashboard' },
  { id:'github', name:'GitHub', category:'개발·CI', consoleUrl:'https://github.com/settings/billing' },
  { id:'domainclub', name:'도메인클럽', category:'도메인', consoleUrl:null },
  { id:'domecook', name:'도메쿡', category:'도메인', consoleUrl:null },
  { id:'google', name:'Google Workspace / Cloud', category:'클라우드·업무', consoleUrl:'https://console.cloud.google.com/billing' },
  { id:'openai', name:'OpenAI', category:'AI·API', consoleUrl:'https://platform.openai.com/usage' },
  { id:'anthropic', name:'Anthropic', category:'AI·API', consoleUrl:'https://console.anthropic.com/settings/billing' },
  { id:'other', name:'기타 인프라·서비스', category:'기타', consoleUrl:null },
]);
const IDS=new Set(PROVIDERS.map(p=>p.id));
const STATUSES=new Set(['unverified','due','paid','cancelled']);
const CURRENCIES=new Set(['USD','KRW','EUR','JPY']);
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const response=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'}});
const value=(input,max=200)=>String(input??'').trim().slice(0,max);
const date=input=>{
  if(!input)return null;
  const s=value(input,10);
  if(!DATE.test(s)||Number.isNaN(Date.parse(s+'T00:00:00Z')))throw new Error('날짜는 YYYY-MM-DD 형식이어야 합니다.');
  return s;
};
const required=(input,max=120)=>{
  const s=value(input,max);
  if(!s)throw new Error('필수 입력값이 없습니다.');
  return s;
};
const money=(input)=>{
  if(!Number.isFinite(Number(input))||Number(input)<0||Number(input)>100000000)throw new Error('금액이 올바르지 않습니다.');
  return Math.round(Number(input)*100);
};
const currency=(input)=>{
  const v=value(input,3).toUpperCase();
  if(!CURRENCIES.has(v))throw new Error('지원하지 않는 통화입니다.');
  return v;
};
const provider=input=>{
  const v=value(input,30);
  if(!IDS.has(v))throw new Error('등록되지 않은 공급자입니다.');
  return v;
};
async function admin(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const reply=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!reply.ok)return { denied:response({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401) };
  const session=await reply.json().catch(()=>null);
  if(!session?.authenticated||session.role!=='super_admin')
    return {denied:response({error:'플랫폼 최고관리자 권한이 필요합니다.',code:'SUPER_ADMIN_REQUIRED'},403)};
  return { actor:value(session.email||'super_admin',160) };
}
async function schema(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS infra_cost_invoices ('+
    'id TEXT PRIMARY KEY, provider TEXT NOT NULL, account_label TEXT NOT NULL DEFAULT \'EKODI\', '+
    'invoice_number TEXT NOT NULL, issued_on TEXT, due_on TEXT, period_start TEXT, period_end TEXT, '+
    'amount_minor INTEGER NOT NULL CHECK(amount_minor>=0), currency TEXT NOT NULL, '+
    'status TEXT NOT NULL DEFAULT \'unverified\', paid_on TEXT, evidence_ref TEXT, memo TEXT, source TEXT NOT NULL DEFAULT \'manual\', '+
    'created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, '+
    'UNIQUE(provider,invoice_number))').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS infra_cost_budgets ('+
    'provider TEXT NOT NULL PRIMARY KEY, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, '+
    'updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS infra_cost_renewals ('+
    'id TEXT PRIMARY KEY, provider TEXT NOT NULL, asset_name TEXT NOT NULL, renew_on TEXT NOT NULL, '+
    'amount_minor INTEGER, currency TEXT, auto_renew INTEGER NOT NULL DEFAULT 0, memo TEXT, '+
    'updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(provider,asset_name))').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS infra_cost_audit ('+
    'id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT NOT NULL, '+
    'summary TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  // Screenshot-derived reference invoices are NOT evidence of payment. Import once.
  const screenshots=[
    ['cloudflare-in-81128159','cloudflare','IN-81128159','2026-09-27','2026-09-28','2026-09-27','2026-10-24',467],
    ['cloudflare-in-85591032','cloudflare','IN-85591032','2026-10-25','2026-10-25','2026-10-25','2026-11-24',500],
  ];
  for(const row of screenshots)
    await db.prepare('INSERT OR IGNORE INTO infra_cost_invoices '+
      '(id,provider,account_label,invoice_number,issued_on,due_on,period_start,period_end,amount_minor,currency,status,memo,source) '+
      'VALUES (?, ?, \'EKODI\', ?, ?, ?, ?, ?, ?, \'USD\', \'unverified\', \'첨부 이미지 기준; 결제 여부 미확인\', \'user-screenshot\')')
      .bind(...row).run();
}
async function audit(db,actor,action,targetId,summary){
  await db.prepare('INSERT INTO infra_cost_audit(id,actor,action,target_id,summary) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor,action,targetId,value(summary,500)).run();
}
async function snapshot(db){
  try{
    const r=await db.prepare('SELECT provider,metric,observed_value,free_limit,usage_percent,source,observed_at '+
      'FROM provider_quota_snapshots ORDER BY observed_at DESC LIMIT 500').all();
    const seen=new Set(),mapped=[];
    for(const row of r.results||[]){
      const key=row.provider+':'+row.metric;
      if(seen.has(key))continue;
      seen.add(key);
      mapped.push({...row});
    }
    return mapped;
  }catch{return [];}
}
async function list(db){
  const [invoices,budgets,renewals,usage,auditRows]=await Promise.all([
    db.prepare('SELECT * FROM infra_cost_invoices ORDER BY issued_on DESC,created_at DESC LIMIT 600').all(),
    db.prepare('SELECT * FROM infra_cost_budgets ORDER BY provider').all(),
    db.prepare('SELECT * FROM infra_cost_renewals ORDER BY renew_on ASC LIMIT 400').all(),
    snapshot(db),
    db.prepare('SELECT actor,action,target_id,summary,created_at FROM infra_cost_audit ORDER BY created_at DESC LIMIT 30').all(),
  ]);
  const today=new Date().toISOString().slice(0,10);
  const warningDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const renewalDate=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const inv=invoices.results||[],b=budgets.results||[],ren=renewals.results||[];
  const totals={};
  for(const x of inv){
    if(x.status==='cancelled')continue;
    const key=x.currency;
    totals[key]=(totals[key]||0)+Number(x.amount_minor||0);
  }
  const renewSoon=ren.filter(x=>x.renew_on<=renewalDate);
  const overdue=inv.filter(x=>x.status==='due'&&x.due_on&&x.due_on<today);
  const dueSoon=inv.filter(x=>x.status==='due'&&x.due_on&&x.due_on>=today&&x.due_on<=warningDate);
  const providerSpend={};
  for(const x of inv){
    if(x.status==='cancelled'||!x.issued_on?.startsWith(today.slice(0,7)))continue;
    const key=x.provider+':'+x.currency;providerSpend[key]=(providerSpend[key]||0)+Number(x.amount_minor||0);
  }
  const budgetAlerts=b.filter(x=>x.amount_minor>0&&
    (providerSpend[x.provider+':'+x.currency]||0)*100>=x.amount_minor*80).map(x=>({
      provider:x.provider,currency:x.currency,spentMinor:providerSpend[x.provider+':'+x.currency]||0,budgetMinor:x.amount_minor
    }));
  return { generatedAt:new Date().toISOString(),providers:PROVIDERS,invoices:inv,budgets:b,
    renewals:ren,usage, audit:auditRows.results||[],
    overview:{totalsMinorByCurrency:totals,unverified:inv.filter(x=>x.status==='unverified').length,
      overdue:overdue.length,dueSoon:dueSoon.length,renewSoon:renewSoon.length,budgetAlerts},
    evidence:'사용량은 기존 계측 원장의 관측값이며 청구·결제 금액으로 간주하지 않습니다.' };
}
function checkOrigin(request){
  const o=request.headers.get('origin');
  if(!o)return true; // Non-browser privileged tools also require a bearer admin session.
  return o===new URL(request.url).origin||o==='https://ekodi.kr';
}
async function payload(request){
  if(!String(request.headers.get('content-type')||'').includes('application/json'))throw new Error('JSON 요청만 지원합니다.');
  const raw=await request.text();
  if(raw.length>12000)throw new Error('입력 데이터가 너무 큽니다.');
  return JSON.parse(raw);
}
async function createInvoice(db,actor,data){
  const p=provider(data.provider),num=required(data.invoiceNumber,100),cur=currency(data.currency||'USD');
  const id=crypto.randomUUID();
  const fields=[id,p,value(data.accountLabel||'EKODI',120),num,date(data.issuedOn),date(data.dueOn),
    date(data.periodStart),date(data.periodEnd),money(data.amount),cur,
    STATUSES.has(data.status)?data.status:'unverified',
    data.status==='paid'?(date(data.paidOn)||new Date().toISOString().slice(0,10)):null,
    value(data.evidenceRef,500),value(data.memo,500)];
  const existing=await db.prepare('SELECT id FROM infra_cost_invoices WHERE provider=? AND invoice_number=?').bind(p,num).first();
  if(existing)return response({error:'이미 등록된 공급자·청구번호입니다.',code:'DUPLICATE_INVOICE'},409);
  await db.prepare('INSERT INTO infra_cost_invoices '+
    '(id,provider,account_label,invoice_number,issued_on,due_on,period_start,period_end,amount_minor,currency,status,paid_on,evidence_ref,memo) '+
    'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...fields).run();
  await audit(db,actor,'invoice-created',id,p+' '+num);
  return response({ok:true,id},201);
}
async function updateInvoice(db,actor,id,data){
  const old=await db.prepare('SELECT * FROM infra_cost_invoices WHERE id=?').bind(id).first();
  if(!old)return response({error:'청구서를 찾을 수 없습니다.'},404);
  if(!STATUSES.has(data.status))return response({error:'허용되지 않은 상태입니다.'},400);
  const paidOn=data.status==='paid'?(date(data.paidOn)||new Date().toISOString().slice(0,10)):null;
  await db.prepare('UPDATE infra_cost_invoices SET status=?,paid_on=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(data.status,paidOn,id).run();
  await audit(db,actor,'invoice-status',id,old.status+' → '+data.status);
  return response({ok:true,id,status:data.status});
}
async function saveBudget(db,actor,data){
  const p=provider(data.provider),cur=currency(data.currency||'USD'),amount=money(data.amount);
  await db.prepare('INSERT INTO infra_cost_budgets(provider,amount_minor,currency) VALUES(?,?,?) '+
    'ON CONFLICT(provider) DO UPDATE SET amount_minor=excluded.amount_minor,currency=excluded.currency,updated_at=CURRENT_TIMESTAMP')
    .bind(p,amount,cur).run();
  await audit(db,actor,'budget-upsert',p,String(amount)+' '+cur);
  return response({ok:true});
}
async function saveRenewal(db,actor,data){
  const p=provider(data.provider),asset=required(data.assetName,150),when=date(required(data.renewOn,10));
  const amt=data.amount==null||data.amount===''?null:money(data.amount);
  const cur=amt===null?null:currency(data.currency||'KRW');
  const existing=await db.prepare('SELECT id FROM infra_cost_renewals WHERE provider=? AND asset_name=?').bind(p,asset).first();
  const id=existing?.id||crypto.randomUUID();
  await db.prepare('INSERT INTO infra_cost_renewals(id,provider,asset_name,renew_on,amount_minor,currency,auto_renew,memo) '+
    'VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(provider,asset_name) DO UPDATE SET '+
    'renew_on=excluded.renew_on,amount_minor=excluded.amount_minor,currency=excluded.currency,'+
    'auto_renew=excluded.auto_renew,memo=excluded.memo,updated_at=CURRENT_TIMESTAMP')
    .bind(id,p,asset,when,amt,cur,data.autoRenew===true?1:0,value(data.memo,500)).run();
  await audit(db,actor,'renewal-upsert',id,p+' '+asset+' '+when);
  return response({ok:true,id});
}
export async function handleInfraCostControl(request,env={}){
  const path=new URL(request.url).pathname;
  if(path!==ROOT&&!path.startsWith(ROOT+'/'))return null;
  if(!['GET','POST','PATCH'].includes(request.method))return response({error:'지원하지 않는 메서드입니다.'},405);
  const authority=await admin(request,env);
  if(authority.denied)return authority.denied;
  if(!env.DB?.prepare)return response({error:'비용 원장 D1 연결이 필요합니다.',code:'INFRA_COST_DB_MISSING'},503);
  if(request.method!=='GET'&&!checkOrigin(request))return response({error:'허용되지 않은 요청 출처입니다.'},403);
  try{
    await schema(env.DB);
    if(path===ROOT&&request.method==='GET')return response(await list(env.DB));
    if(request.method==='POST'){
      const data=await payload(request);
      if(path===ROOT+'/invoices')return await createInvoice(env.DB,authority.actor,data);
      if(path===ROOT+'/budgets')return await saveBudget(env.DB,authority.actor,data);
      if(path===ROOT+'/renewals')return await saveRenewal(env.DB,authority.actor,data);
    }
    const match=path.match(/^\/api\/control\/infra-costs\/invoices\/([a-z0-9-]{1,100})$/);
    if(match&&request.method==='PATCH')return await updateInvoice(env.DB,authority.actor,match[1],await payload(request));
    return response({error:'관리 경로가 없습니다.'},404);
  }catch(err){
    if(err instanceof SyntaxError)return response({error:'잘못된 JSON 데이터입니다.'},400);
    if(/필수|날짜|금액|통화|등록되지|허용되지|입력|JSON/.test(err.message))return response({error:err.message},400);
    console.error('infra cost control error',err);
    return response({error:'비용 원장을 처리할 수 없습니다.',code:'INFRA_COST_FAILURE'},500);
  }
}
