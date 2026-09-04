import authWorker from './auth-worker.js';

const PREFIX='/api/mall/admin';
const ALLOWED_ORIGINS=new Set(['https://ekodi.kr','https://admin.ekodi.kr']);
const STATUSES=new Set(['draft','review','approved','archived']);
const BUDGET_TIERS=new Set(['','light','standard','premium','luxury']);
const RELATIONSHIP_LEVELS=new Set([1,2,3,4,5]);

function cors(request){
  const origin=String(request.headers.get('origin')||'');
  const headers=new Headers({
    'access-control-allow-headers':'authorization,content-type',
    'access-control-allow-methods':'GET,PUT,POST,OPTIONS',
    'access-control-max-age':'86400',vary:'Origin'
  });
  if(ALLOWED_ORIGINS.has(origin))headers.set('access-control-allow-origin',origin);
  return headers;
}
function json(request,data,status=200,sourceHeaders=null){
  const headers=cors(request);headers.set('content-type','application/json; charset=utf-8');
  headers.set('cache-control','no-store');headers.set('x-content-type-options','nosniff');
  if(sourceHeaders?.get('access-control-allow-origin'))headers.set('access-control-allow-origin',sourceHeaders.get('access-control-allow-origin'));
  return new Response(JSON.stringify(data),{status,headers});
}
const clean=(value,max=500)=>String(value??'').trim().slice(0,max);
function list(value,maxItems=20,maxLen=120){
  const source=Array.isArray(value)?value:String(value??'').split(',');
  return [...new Set(source.map(v=>clean(v,maxLen)).filter(Boolean))].slice(0,maxItems);
}
function parseJsonList(value){try{return list(JSON.parse(value||'[]'))}catch{return[]}}
function productKey(value){const key=clean(value,180);return /^[a-z0-9][a-z0-9:._-]{1,179}$/i.test(key)?key:''}
async function body(request){try{return await request.json()}catch{return null}}
async function sessionCheck(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url,{method:'GET',headers:request.headers}),env);
  if(!response.ok)return{response};
  const session=await response.clone().json().catch(()=>null);
  return session?.authenticated&&session?.email?{response,session}:{response};
}
async function adminId(env,email){
  const row=await env.DB.prepare('SELECT id FROM admins WHERE lower(trim(email))=?').bind(clean(email,320).toLowerCase()).first();
  return row?.id||null;
}
async function audit(env,session,action,resource,detail=''){
  const id=await adminId(env,session.email);
  await env.DB.prepare('INSERT INTO audit_logs(admin_id,action,resource,detail,created_at) VALUES(?,?,?,?,?)')
    .bind(id,action,resource,clean(detail,500),new Date().toISOString()).run();
}
async function ensureSchema(db){
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS mall_product_context(
      product_key TEXT PRIMARY KEY,provider_key TEXT NOT NULL DEFAULT '',provider_product_id TEXT NOT NULL DEFAULT '',display_name TEXT NOT NULL,
      recipients_json TEXT NOT NULL DEFAULT '[]',occasions_json TEXT NOT NULL DEFAULT '[]',relationship_min INTEGER NOT NULL DEFAULT 1,
      relationship_max INTEGER NOT NULL DEFAULT 5,budget_tier TEXT NOT NULL DEFAULT '',gift_meaning TEXT NOT NULL DEFAULT '',caution_text TEXT NOT NULL DEFAULT '',
      tones_json TEXT NOT NULL DEFAULT '[]',tags_json TEXT NOT NULL DEFAULT '[]',alternatives_json TEXT NOT NULL DEFAULT '[]',relationship_copy TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',updated_by TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mall_context_status ON mall_product_context(status,updated_at DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS mall_context_reviews(
      id INTEGER PRIMARY KEY AUTOINCREMENT,product_key TEXT NOT NULL,from_status TEXT NOT NULL,to_status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',actor TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL)`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mall_review_product ON mall_context_reviews(product_key,created_at DESC)')
  ]);
}
function contextView(row){if(!row)return null;return{
  productKey:row.product_key,providerKey:row.provider_key||'',providerProductId:row.provider_product_id||'',displayName:row.display_name,
  recipients:parseJsonList(row.recipients_json),occasions:parseJsonList(row.occasions_json),relationshipMin:Number(row.relationship_min||1),
  relationshipMax:Number(row.relationship_max||5),budgetTier:row.budget_tier||'',giftMeaning:row.gift_meaning||'',caution:row.caution_text||'',
  tones:parseJsonList(row.tones_json),tags:parseJsonList(row.tags_json),alternatives:parseJsonList(row.alternatives_json),
  relationshipCopy:row.relationship_copy||'',status:row.status||'draft',updatedAt:row.updated_at||null
}}
async function overview(env){
  const [contexts,products,clicks,revenue]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) total,SUM(status='approved') approved,SUM(status='review') review,SUM(status='draft') draft FROM mall_product_context`).first(),
    env.DB.prepare(`SELECT COUNT(*) total FROM affiliate_storefront_products WHERE storefront_slug='ekodi-mall' AND status='active'`).first().catch(()=>({total:0})),
    env.DB.prepare(`SELECT COALESCE(SUM(clicks),0) total FROM affiliate_storefront_clicks WHERE click_date>=date('now','-29 day')`).first().catch(()=>({total:0})),
    env.DB.prepare(`SELECT COALESCE(SUM(orders),0) orders,COALESCE(SUM(revenue_krw),0) revenue FROM affiliate_daily_metrics WHERE metric_date>=date('now','-29 day')`).first().catch(()=>({orders:0,revenue:0}))
  ]);
  return{generatedAt:new Date().toISOString(),summary:{activeProducts:Number(products?.total||0),contexts:Number(contexts?.total||0),approved:Number(contexts?.approved||0),review:Number(contexts?.review||0),draft:Number(contexts?.draft||0),clicks30d:Number(clicks?.total||0),orders30d:Number(revenue?.orders||0),revenue30dKrw:Number(revenue?.revenue||0)},
    boundaries:{relationshipHealthSeparatedFromCommercialValue:true,commissionAffectsRecommendation:false,personalRelationshipDataStoredHere:false,externalCheckoutAllowed:true},
    policy:{recommendationOrder:['relationship_fit','occasion_fit','budget_fit','quality_and_delivery','user_preference'],commercialSignals:['commission','margin','sponsorship'],commercialSignalsInRecommendationScore:false}}
}
async function listContexts(env,url){
  const limit=Math.max(1,Math.min(300,Number(url.searchParams.get('limit'))||200));
  const status=clean(url.searchParams.get('status'),20);const query=clean(url.searchParams.get('q'),100).toLowerCase();
  let sql='SELECT * FROM mall_product_context';const binds=[];const where=[];
  if(STATUSES.has(status)){where.push('status=?');binds.push(status)}
  if(query){where.push('(lower(display_name) LIKE ? OR lower(product_key) LIKE ?)');binds.push(`%${query}%`,`%${query}%`)}
  if(where.length)sql+=` WHERE ${where.join(' AND ')}`;sql+=' ORDER BY updated_at DESC LIMIT ?';binds.push(limit);
  const rows=await env.DB.prepare(sql).bind(...binds).all();return(rows.results||[]).map(contextView);
}
function normalizeContext(input,current={}){
  const min=Number(input.relationshipMin??current.relationship_min??1),max=Number(input.relationshipMax??current.relationship_max??5);
  if(!RELATIONSHIP_LEVELS.has(min)||!RELATIONSHIP_LEVELS.has(max)||min>max)throw new Error('RELATIONSHIP_RANGE_INVALID');
  const budget=clean(input.budgetTier??current.budget_tier,20);if(!BUDGET_TIERS.has(budget))throw new Error('BUDGET_TIER_INVALID');
  const status=clean(input.status??current.status??'draft',20);if(!STATUSES.has(status))throw new Error('STATUS_INVALID');
  return{providerKey:clean(input.providerKey??current.provider_key,80),providerProductId:clean(input.providerProductId??current.provider_product_id,120),
    displayName:clean(input.displayName??current.display_name,200),recipients:list(input.recipients??parseJsonList(current.recipients_json),30),
    occasions:list(input.occasions??parseJsonList(current.occasions_json),30),relationshipMin:min,relationshipMax:max,budgetTier:budget,
    giftMeaning:clean(input.giftMeaning??current.gift_meaning,600),caution:clean(input.caution??current.caution_text,600),tones:list(input.tones??parseJsonList(current.tones_json),12),
    tags:list(input.tags??parseJsonList(current.tags_json),30),alternatives:list(input.alternatives??parseJsonList(current.alternatives_json),20,180),
    relationshipCopy:clean(input.relationshipCopy??current.relationship_copy,1600),status};
}
async function upsertContext(request,env,session,key){
  const input=await body(request);if(!input)return json(request,{error:'올바른 JSON 요청이 필요합니다.',code:'MALL_CONTEXT_JSON_REQUIRED'},400);
  const current=await env.DB.prepare('SELECT * FROM mall_product_context WHERE product_key=?').bind(key).first();
  const requestedStatus=clean(input.status,20);
  if(requestedStatus==='approved')return json(request,{error:'승인은 검수함의 Human Gate를 통해서만 가능합니다.',code:'MALL_APPROVAL_HUMAN_GATE_REQUIRED'},409);
  if(!requestedStatus&&current?.status==='approved')input.status='draft';
  let value;try{value=normalizeContext(input,current||{})}catch(error){return json(request,{error:'관계형 상품 메타데이터 값이 유효하지 않습니다.',code:error.message},400)}
  if(!value.displayName)return json(request,{error:'상품명이 필요합니다.',code:'MALL_PRODUCT_NAME_REQUIRED'},400);
  const now=new Date().toISOString(),actor=clean(session.email,320).toLowerCase();
  await env.DB.prepare(`INSERT INTO mall_product_context(product_key,provider_key,provider_product_id,display_name,recipients_json,occasions_json,relationship_min,relationship_max,budget_tier,gift_meaning,caution_text,tones_json,tags_json,alternatives_json,relationship_copy,status,updated_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(product_key) DO UPDATE SET provider_key=excluded.provider_key,provider_product_id=excluded.provider_product_id,display_name=excluded.display_name,recipients_json=excluded.recipients_json,occasions_json=excluded.occasions_json,relationship_min=excluded.relationship_min,relationship_max=excluded.relationship_max,budget_tier=excluded.budget_tier,gift_meaning=excluded.gift_meaning,caution_text=excluded.caution_text,tones_json=excluded.tones_json,tags_json=excluded.tags_json,alternatives_json=excluded.alternatives_json,relationship_copy=excluded.relationship_copy,status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(key,value.providerKey,value.providerProductId,value.displayName,JSON.stringify(value.recipients),JSON.stringify(value.occasions),value.relationshipMin,value.relationshipMax,value.budgetTier,value.giftMeaning,value.caution,JSON.stringify(value.tones),JSON.stringify(value.tags),JSON.stringify(value.alternatives),value.relationshipCopy,value.status,actor,current?.created_at||now,now).run();
  if(current?.status!==value.status)await env.DB.prepare('INSERT INTO mall_context_reviews(product_key,from_status,to_status,note,actor,created_at) VALUES(?,?,?,?,?,?)').bind(key,current?.status||'new',value.status,clean(input.reviewNote,400),actor,now).run();
  await audit(env,session,'mall.context.upsert',key,JSON.stringify({status:value.status,recipients:value.recipients.length,occasions:value.occasions.length}));
  const saved=await env.DB.prepare('SELECT * FROM mall_product_context WHERE product_key=?').bind(key).first();return json(request,{context:contextView(saved)});
}
async function transition(request,env,session,key,target){
  const current=await env.DB.prepare('SELECT * FROM mall_product_context WHERE product_key=?').bind(key).first();
  if(!current)return json(request,{error:'관계형 상품 메타데이터가 없습니다.',code:'MALL_CONTEXT_NOT_FOUND'},404);
  if(target==='approved'&&current.status!=='review')return json(request,{error:'검수 상태의 항목만 승인할 수 있습니다.',code:'MALL_APPROVAL_REVIEW_REQUIRED'},409);
  const payload=await body(request)||{};const actor=clean(session.email,320).toLowerCase(),now=new Date().toISOString();
  await env.DB.prepare('UPDATE mall_product_context SET status=?,updated_by=?,updated_at=? WHERE product_key=?').bind(target,actor,now,key).run();
  await env.DB.prepare('INSERT INTO mall_context_reviews(product_key,from_status,to_status,note,actor,created_at) VALUES(?,?,?,?,?,?)').bind(key,current.status,target,clean(payload.note,400),actor,now).run();
  await audit(env,session,`mall.context.${target}`,key,clean(payload.note,400));
  const saved=await env.DB.prepare('SELECT * FROM mall_product_context WHERE product_key=?').bind(key).first();return json(request,{context:contextView(saved)});
}
export async function handleMallAdminRequest(request,env){
  const url=new URL(request.url);if(!url.pathname.startsWith(PREFIX))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request)});
  if(!env.DB)return json(request,{error:'EKODI Core 데이터베이스 연결이 필요합니다.',code:'MALL_ADMIN_DATABASE_UNAVAILABLE'},503);
  const auth=await sessionCheck(request,env);if(!auth.session)return auth.response;
  await ensureSchema(env.DB);const path=url.pathname;
  if(request.method==='GET'&&path===`${PREFIX}/overview`)return json(request,await overview(env),200,auth.response.headers);
  if(request.method==='GET'&&path===`${PREFIX}/contexts`)return json(request,{contexts:await listContexts(env,url)},200,auth.response.headers);
  if(request.method==='GET'&&path===`${PREFIX}/review`)return json(request,{contexts:await listContexts(env,new URL(`${url.origin}${PREFIX}/contexts?status=review&limit=200`))},200,auth.response.headers);
  const match=path.match(/^\/api\/mall\/admin\/contexts\/([^/]+)$/);if(match){
    const key=productKey(decodeURIComponent(match[1]));if(!key)return json(request,{error:'상품 식별자가 유효하지 않습니다.',code:'MALL_PRODUCT_KEY_INVALID'},400);
    if(request.method==='GET'){const row=await env.DB.prepare('SELECT * FROM mall_product_context WHERE product_key=?').bind(key).first();return row?json(request,{context:contextView(row)},200,auth.response.headers):json(request,{error:'관계형 상품 메타데이터가 없습니다.',code:'MALL_CONTEXT_NOT_FOUND'},404,auth.response.headers)}
    if(request.method==='PUT')return upsertContext(request,env,auth.session,key);
  }
  const action=path.match(/^\/api\/mall\/admin\/contexts\/([^/]+)\/(approve|review)$/);if(action&&request.method==='POST'){
    const key=productKey(decodeURIComponent(action[1]));if(!key)return json(request,{error:'상품 식별자가 유효하지 않습니다.',code:'MALL_PRODUCT_KEY_INVALID'},400);
    return transition(request,env,auth.session,key,action[2]==='approve'?'approved':'review');
  }
  return json(request,{error:'Mall Admin API endpoint not found',code:'MALL_ADMIN_NOT_FOUND'},404,auth.response.headers);
}
