const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const MENU_PROVIDERS=new Set(['pos_bridge','baemin','coupang_eats','yogiyo']);
const AVAILABILITY=new Set(['available','sold_out','hidden','unknown']);
const encoder=new TextEncoder();

function bearerToken(request){
  const value=String(request.headers.get('authorization')||'');
  return value.toLowerCase().startsWith('bearer ')?value.slice(7).trim():'';
}
function normalizeStoreId(value){
  const id=String(value||'').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)?id:'';
}
function normalizeProvider(value){
  const provider=String(value||'').trim().toLowerCase();
  return MENU_PROVIDERS.has(provider)?provider:'';
}
function boundedText(value,max=180){return String(value??'').trim().slice(0,max)}
function canonicalKey(value){
  return boundedText(value,160).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]+/g,'').slice(0,120);
}
function money(value){const n=Math.floor(Number(value));return Number.isFinite(n)?Math.max(0,Math.min(100000000,n)):0}
function nullableMoney(value){return value==null||value===''?null:money(value)}
function safeDate(value){const d=new Date(value||'');return Number.isNaN(d.getTime())?null:d.toISOString()}
function originAllowed(origin,env={}){
  if(!origin)return true;
  const configured=new Set(String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean));
  if(configured.has(origin))return true;
  try{
    const host=new URL(origin).hostname.toLowerCase();
    return host==='ekodi.kr'||host==='business.ekodi.kr'||host==='admin.ekodi.kr'||/^[a-z0-9-]+\.ai\.ekodi\.kr$/.test(host);
  }catch{return false}
}
function cors(origin,allowed){
  const headers={'access-control-allow-headers':'content-type, authorization, x-ekodi-bridge-key','access-control-allow-methods':'GET, POST, OPTIONS','access-control-max-age':'86400',vary:'Origin'};
  if(origin&&allowed)headers['access-control-allow-origin']=origin;
  return headers;
}
function json(data,status,request,allowed){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...cors(request.headers.get('origin'),allowed)}});
}
async function readJson(request){try{return await request.json()}catch{return null}}
async function sha256(value){
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(String(value||'')));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function constantTimeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i+=1)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function identity(request){
  const token=bearerToken(request);
  if(!token||token.length>8192)return null;
  const [userResponse,workspaceResponse]=await Promise.all([
    fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`}}),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/current_site_workspaces`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({p_site_key:'marketing'})})
  ]);
  if(!userResponse.ok||!workspaceResponse.ok)return null;
  const [user,workspaces]=await Promise.all([userResponse.json(),workspaceResponse.json()]);
  if(!user?.id||!user?.email_confirmed_at)return null;
  return{token,userId:user.id,workspaces:Array.isArray(workspaces)?workspaces:[]};
}
async function storeAccess(request,storeId){
  const store=normalizeStoreId(storeId);if(!store)return{error:'유효한 점포가 필요합니다.',status:400};
  const who=await identity(request);if(!who)return{error:'EKODI 로그인이 필요합니다.',status:401};
  const access=who.workspaces.find(row=>String(row?.store_id||'').toLowerCase()===store&&String(row?.workspace_key||'')===`store:${store}`);
  if(!access)return{error:'이 점포의 운영공간에 접근할 수 없습니다.',status:403};
  return{store,who,access};
}
function publicItem(row){return{id:Number(row.id),provider:String(row.provider||''),externalItemId:String(row.external_item_id||''),canonicalKey:String(row.canonical_key||''),name:String(row.name||''),category:String(row.category||''),priceKrw:Number(row.price_krw||0),salePriceKrw:row.sale_price_krw==null?null:Number(row.sale_price_krw),availability:String(row.availability||'unknown'),optionSummary:String(row.option_summary||''),sourceUpdatedAt:row.source_updated_at||null,importedAt:row.imported_at||null}}
function compareItems(items){
  const groups=new Map();
  for(const item of items){if(!groups.has(item.canonicalKey))groups.set(item.canonicalKey,[]);groups.get(item.canonicalKey).push(item)}
  const mismatches=[];
  for(const [key,rows] of groups){
    if(rows.length<2)continue;
    const prices=new Set(rows.map(row=>row.salePriceKrw??row.priceKrw));
    const availability=new Set(rows.map(row=>row.availability));
    if(prices.size>1||availability.size>1)mismatches.push({canonicalKey:key,name:rows[0]?.name||key,priceMismatch:prices.size>1,availabilityMismatch:availability.size>1,channels:rows.map(row=>({provider:row.provider,priceKrw:row.priceKrw,salePriceKrw:row.salePriceKrw,availability:row.availability}))});
  }
  return mismatches.slice(0,200);
}
async function menuStatus(request,env,allowed){
  const url=new URL(request.url);const ctx=await storeAccess(request,url.searchParams.get('store'));
  if(ctx.error)return json({error:ctx.error},ctx.status,request,allowed);
  const [itemsResult,connectorsResult]=await Promise.all([
    env.DB.prepare(`SELECT id,provider,external_item_id,canonical_key,name,category,price_krw,sale_price_krw,availability,option_summary,source_updated_at,imported_at FROM store_menu_items WHERE store_id=? ORDER BY category,name,provider`).bind(ctx.store).all(),
    env.DB.prepare(`SELECT provider,status,display_name,last_success_at,last_error FROM marketing_data_connectors WHERE workspace_type='store' AND workspace_key=? AND provider IN ('pos_bridge','baemin','coupang_eats','yogiyo') ORDER BY id`).bind(ctx.store).all()
  ]);
  const items=(itemsResult.results||[]).map(publicItem);
  const channelCounts={};for(const item of items)channelCounts[item.provider]=(channelCounts[item.provider]||0)+1;
  return json({storeId:ctx.store,items,connectors:connectorsResult.results||[],summary:{itemRows:items.length,canonicalItems:new Set(items.map(item=>item.canonicalKey)).size,channelCounts,mismatches:compareItems(items)},policy:{source:'official-or-approved-bridge-only',externalWriteBack:false,credentialsReturned:false}},200,request,allowed);
}
function normalizedMenuItem(raw){
  const externalItemId=boundedText(raw?.externalItemId||raw?.id,160);
  const name=boundedText(raw?.name,120);
  const key=canonicalKey(raw?.canonicalKey||name);
  if(!externalItemId||!name||!key)return null;
  const availability=AVAILABILITY.has(String(raw?.availability||'').toLowerCase())?String(raw.availability).toLowerCase():'unknown';
  return{externalItemId,key,name,category:boundedText(raw?.category,80),priceKrw:money(raw?.priceKrw??raw?.price),salePriceKrw:nullableMoney(raw?.salePriceKrw??raw?.salePrice),availability,optionSummary:boundedText(raw?.optionSummary,300),sourceUpdatedAt:safeDate(raw?.sourceUpdatedAt)};
}
async function bridgeIngest(request,env,allowed){
  const body=await readJson(request);const store=normalizeStoreId(body?.store);const provider=normalizeProvider(body?.provider);
  const bridgeKey=String(request.headers.get('x-ekodi-bridge-key')||'').trim();
  if(!store||!provider||bridgeKey.length<32)return json({error:'유효한 점포·공급자·Bridge 인증이 필요합니다.'},401,request,allowed);
  const connector=await env.DB.prepare(`SELECT id,status,bridge_key_hash,display_name FROM marketing_data_connectors WHERE workspace_type='store' AND workspace_key=? AND provider=? LIMIT 1`).bind(store,provider).first();
  if(!connector||connector.status!=='active'||!connector.bridge_key_hash)return json({error:'활성화된 공식/승인 Bridge를 찾을 수 없습니다.'},403,request,allowed);
  const incomingHash=await sha256(bridgeKey);if(!constantTimeEqual(incomingHash,String(connector.bridge_key_hash)))return json({error:'Bridge 인증에 실패했습니다.'},403,request,allowed);
  const rawItems=Array.isArray(body?.items)?body.items.slice(0,500):[];if(!rawItems.length)return json({error:'가져올 메뉴가 없습니다.'},400,request,allowed);
  const deduped=new Map();for(const raw of rawItems){const item=normalizedMenuItem(raw);if(item)deduped.set(item.externalItemId,item)}
  const items=[...deduped.values()];if(!items.length)return json({error:'유효한 메뉴 항목이 없습니다.'},400,request,allowed);
  const now=new Date().toISOString();const statements=[env.DB.prepare(`DELETE FROM store_menu_items WHERE store_id=? AND provider=?`).bind(store,provider)];
  for(const item of items){statements.push(env.DB.prepare(`INSERT INTO store_menu_items (store_id,provider,external_item_id,canonical_key,name,category,price_krw,sale_price_krw,availability,option_summary,source_updated_at,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(store,provider,item.externalItemId,item.key,item.name,item.category,item.priceKrw,item.salePriceKrw,item.availability,item.optionSummary,item.sourceUpdatedAt,now))}
  await env.DB.batch(statements);
  await env.DB.prepare(`UPDATE marketing_data_connectors SET last_sync_at=?,last_success_at=?,last_error='',synced_records=synced_records+?,updated_at=? WHERE id=?`).bind(now,now,items.length,now,connector.id).run();
  return json({ok:true,storeId:store,provider,displayName:connector.display_name,imported:items.length,replacedSnapshot:true,externalWriteBack:false},202,request,allowed);
}

export async function handleStoreMenuControl(request,env){
  if(!env.DB)return json({error:'점포 메뉴 데이터베이스가 준비되지 않았습니다.'},503,request,false);
  const origin=request.headers.get('origin');const allowed=originAllowed(origin,env);
  if(origin&&!allowed)return json({error:'허용되지 않은 요청입니다.'},403,request,false);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin,allowed)});
  const path=new URL(request.url).pathname;
  if(request.method==='GET'&&path==='/api/store/menu')return menuStatus(request,env,allowed);
  if(request.method==='POST'&&path==='/api/store/menu/bridge/ingest')return bridgeIngest(request,env,allowed);
  return null;
}
