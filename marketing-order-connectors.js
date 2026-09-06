const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const STORE_MANAGER_ROLES = new Set(['store_owner','tenant_admin','platform_admin','hq_manager','client_admin','accounting_manager']);
const BRIDGE_PROVIDERS = new Set(['pos_bridge','baemin','coupang_eats','yogiyo']);
const encoder = new TextEncoder();

function bearerToken(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}
function normalizeStoreId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : '';
}
function normalizeProvider(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_]{2,40}$/.test(text) ? text : '';
}
function normalizeSlug(value, fallback='unknown') {
  const text = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');
  return (text || fallback).slice(0,60);
}
function boundedText(value, max=180) { return String(value || '').trim().slice(0,max); }
function originAllowed(origin, env={}) {
  if (!origin) return true;
  const configured = new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean));
  if (configured.has(origin)) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === 'ekodi.kr' || host === 'business.ekodi.kr' || host === 'admin.ekodi.kr' || /^[a-z0-9-]+\.ai\.ekodi\.kr$/.test(host);
  } catch { return false; }
}
function cors(origin, allowed) {
  const headers = {
    'access-control-allow-headers':'content-type, authorization, x-ekodi-bridge-key',
    'access-control-allow-methods':'GET, POST, OPTIONS',
    'access-control-max-age':'86400',
    vary:'Origin',
  };
  if (origin && allowed) headers['access-control-allow-origin'] = origin;
  return headers;
}
function json(data, status, request, allowed) {
  return new Response(JSON.stringify(data), {
    status,
    headers:{ 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...cors(request.headers.get('origin'),allowed) },
  });
}
async function readJson(request) { try { return await request.json(); } catch { return null; } }
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '')));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
}
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function normalizedCustomerRef(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g,'').slice(0,320);
}
async function customerKey(template, raw) {
  const ref = normalizedCustomerRef(raw);
  return ref ? sha256(`${String(template.identity_salt || '')}\0${ref}`) : '';
}

async function identity(request) {
  const token = bearerToken(request);
  if (!token || token.length > 8192) return null;
  const [userResponse, workspaceResponse] = await Promise.all([
    fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, authorization:`Bearer ${token}` } }),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/current_site_workspaces`, {
      method:'POST',
      headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, authorization:`Bearer ${token}`,'content-type':'application/json' },
      body:JSON.stringify({ p_site_key:'marketing' }),
    }),
  ]);
  if (!userResponse.ok || !workspaceResponse.ok) return null;
  const [user, workspaces] = await Promise.all([userResponse.json(), workspaceResponse.json()]);
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return { token, userId:user.id, email, workspaces:Array.isArray(workspaces) ? workspaces : [] };
}

async function storeContext(request, env, storeId, requireManager=true) {
  const store = normalizeStoreId(storeId);
  if (!store) return { error:'유효한 점포가 필요합니다.', status:400 };
  const who = await identity(request);
  if (!who) return { error:'EKODI 로그인과 Marketing workspace 권한이 필요합니다.', status:401 };
  const access = who.workspaces.find(row => String(row?.store_id || '').toLowerCase() === store && String(row?.workspace_key || '') === `store:${store}`);
  if (!access) return { error:'이 점포의 Marketing workspace에 접근할 수 없습니다.', status:403 };
  if (requireManager && !STORE_MANAGER_ROLES.has(String(access.role || ''))) return { error:'이 점포의 데이터 연결을 관리할 권한이 없습니다.', status:403 };
  const template = await env.DB.prepare(`SELECT workspace_type,workspace_key,tenant_slug,store_id,template_key,identity_salt
    FROM marketing_workspace_templates WHERE workspace_type='store' AND workspace_key=? LIMIT 1`).bind(store).first();
  if (!template) return { error:'이 점포의 CRM 템플릿이 아직 활성화되지 않았습니다.', status:404 };
  return { store, who, access, template };
}

function publicConnector(row) {
  return {
    id:Number(row.id), provider:String(row.provider || ''), kind:String(row.connector_kind || ''), mode:String(row.mode || ''),
    status:String(row.status || ''), displayName:String(row.display_name || ''), lastSyncAt:row.last_sync_at || null,
    lastSuccessAt:row.last_success_at || null, lastError:String(row.last_error || ''), syncedRecords:Number(row.synced_records || 0),
    paired:Boolean(row.bridge_key_hash),
  };
}

async function connectorStatus(request, env, allowed) {
  const url = new URL(request.url);
  const ctx = await storeContext(request, env, url.searchParams.get('store'));
  if (ctx.error) return json({ error:ctx.error }, ctx.status, request, allowed);
  const rows = await env.DB.prepare(`SELECT id,provider,connector_kind,mode,status,display_name,bridge_key_hash,last_sync_at,last_success_at,last_error,synced_records
    FROM marketing_data_connectors WHERE workspace_type='store' AND workspace_key=? ORDER BY id`).bind(ctx.store).all();
  return json({
    storeId:ctx.store,
    connectors:(rows.results || []).map(publicConnector),
    policy:{ rawCustomerIdentityStored:false, credentialsStoredInDatabase:false, externalWriteBack:false, officialOrApprovedSourcesOnly:true },
  },200,request,allowed);
}

function channelForSource(source) {
  const s = String(source || '').toLowerCase();
  if (/baemin|배민/.test(s)) return 'baemin';
  if (/coupang|쿠팡/.test(s)) return 'coupang_eats';
  if (/yogiyo|요기요/.test(s)) return 'yogiyo';
  if (/pos|van|kiosk|키오스크|포스/.test(s)) return 'pos';
  return 'owned_order';
}
function sourceForOrder(source) {
  const s = normalizeSlug(source || 'ekodi_orders','ekodi_orders');
  return s === 'unknown' ? 'ekodi_orders' : s;
}

async function fetchCompletedOrders(ctx, cursor) {
  const params = new URLSearchParams();
  params.set('select','id,order_no,customer_user_id,customer_phone,total,status,source,created_at');
  params.set('store_id',`eq.${ctx.store}`);
  params.set('status','eq.completed');
  if (cursor) params.set('created_at',`gt.${cursor}`);
  params.set('order','created_at.asc');
  params.set('limit','500');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/orders?${params.toString()}`, {
    headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, authorization:`Bearer ${ctx.who.token}` },
  });
  if (!response.ok) throw Object.assign(new Error(`주문 원장 조회 실패 (${response.status})`), { status:response.status });
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function insertOrders(env, ctx, orders) {
  if (!orders.length) return { inserted:0, cursor:'' };
  const existing = await env.DB.prepare(`SELECT DISTINCT customer_key FROM marketing_events
    WHERE workspace_type='store' AND workspace_key=? AND customer_key<>'' AND event_type IN ('order','repeat_order')`).bind(ctx.store).all();
  const seen = new Set((existing.results || []).map(row => String(row.customer_key || '')).filter(Boolean));
  const statements = [];
  let cursor = '';
  const now = new Date().toISOString();
  for (const order of orders) {
    const customerRef = order?.customer_user_id || order?.customer_phone || '';
    const pseudonym = await customerKey(ctx.template, customerRef);
    const eventType = pseudonym && seen.has(pseudonym) ? 'repeat_order' : 'order';
    if (pseudonym) seen.add(pseudonym);
    const occurredAt = new Date(order?.created_at || now).toISOString();
    cursor = !cursor || occurredAt > cursor ? occurredAt : cursor;
    const source = sourceForOrder(order?.source);
    const channel = channelForSource(source);
    const externalRef = `supabase:${String(order?.id || order?.order_no || '')}`.slice(0,180);
    const value = Math.max(0,Math.min(1000000000,Math.floor(Number(order?.total || 0))));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO marketing_events
      (workspace_type,workspace_key,tenant_slug,store_id,customer_key,event_type,channel,campaign_id,value_krw,quantity,consent_scope,source,external_ref,metadata_json,occurred_at,created_at)
      VALUES ('store',?,?,?,?,?,?,NULL,?,1,'unknown',?,?,'{}',?,?)`)
      .bind(ctx.store,ctx.template.tenant_slug,ctx.store,pseudonym,eventType,channel,value,source,externalRef,occurredAt,now));
  }
  const results = statements.length ? await env.DB.batch(statements) : [];
  const inserted = results.reduce((sum,item) => sum + Number(item?.meta?.changes || 0),0);
  return { inserted, cursor };
}

async function syncSupabaseOrders(request, env, allowed) {
  const body = await readJson(request);
  const ctx = await storeContext(request, env, body?.store);
  if (ctx.error) return json({ error:ctx.error }, ctx.status, request, allowed);
  const connector = await env.DB.prepare(`SELECT * FROM marketing_data_connectors
    WHERE workspace_type='store' AND workspace_key=? AND provider='supabase_orders' LIMIT 1`).bind(ctx.store).first();
  if (!connector) return json({ error:'EKODI Orders 커넥터가 준비되지 않았습니다.' },404,request,allowed);
  let cursor = String(connector.cursor_value || '');
  let totalRead = 0;
  let totalInserted = 0;
  let hasMore = false;
  try {
    for (let page=0; page<4; page += 1) {
      const orders = await fetchCompletedOrders(ctx,cursor);
      totalRead += orders.length;
      const result = await insertOrders(env,ctx,orders);
      totalInserted += result.inserted;
      if (result.cursor) cursor = result.cursor;
      if (orders.length < 500) { hasMore = false; break; }
      hasMore = true;
    }
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE marketing_data_connectors SET status='active',cursor_value=?,last_sync_at=?,last_success_at=?,last_error='',synced_records=synced_records+?,updated_at=? WHERE id=?`)
      .bind(cursor,now,now,totalInserted,now,connector.id).run();
    return json({ ok:true,storeId:ctx.store,read:totalRead,inserted:totalInserted,hasMore,cursor:cursor || null,safety:{ rawCustomerIdentityStored:false,externalWriteBack:false } },200,request,allowed);
  } catch (error) {
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE marketing_data_connectors SET status='error',last_sync_at=?,last_error=?,updated_at=? WHERE id=?`)
      .bind(now,boundedText(error?.message || String(error),500),now,connector.id).run();
    return json({ error:'주문 원장 동기화에 실패했습니다.',code:'ORDER_SYNC_FAILED' }, error?.status === 401 || error?.status === 403 ? 403 : 502, request, allowed);
  }
}

async function pairBridge(request, env, allowed) {
  const body = await readJson(request);
  const ctx = await storeContext(request, env, body?.store);
  if (ctx.error) return json({ error:ctx.error }, ctx.status, request, allowed);
  const provider = normalizeProvider(body?.provider);
  if (!BRIDGE_PROVIDERS.has(provider)) return json({ error:'지원하지 않는 Bridge 공급자입니다.' },400,request,allowed);
  const connector = await env.DB.prepare(`SELECT id,display_name FROM marketing_data_connectors
    WHERE workspace_type='store' AND workspace_key=? AND provider=? LIMIT 1`).bind(ctx.store,provider).first();
  if (!connector) return json({ error:'이 점포에 등록되지 않은 커넥터입니다.' },404,request,allowed);
  const token = randomToken();
  const hash = await sha256(token);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE marketing_data_connectors SET bridge_key_hash=?,status='active',last_error='',updated_at=? WHERE id=?`)
    .bind(hash,now,connector.id).run();
  return json({ ok:true,storeId:ctx.store,provider,displayName:connector.display_name,bridgeKey:token,warning:'이 키는 다시 표시되지 않습니다. 승인된 POS/배달앱 중계기에만 등록하세요.',externalWriteBack:false },201,request,allowed);
}

async function bridgeIngest(request, env, allowed) {
  const body = await readJson(request);
  const store = normalizeStoreId(body?.store);
  const provider = normalizeProvider(body?.provider);
  const key = String(request.headers.get('x-ekodi-bridge-key') || '').trim();
  if (!store || !BRIDGE_PROVIDERS.has(provider) || key.length < 32) return json({ error:'유효한 Bridge 인증정보가 필요합니다.' },401,request,allowed);
  const connector = await env.DB.prepare(`SELECT * FROM marketing_data_connectors
    WHERE workspace_type='store' AND workspace_key=? AND provider=? LIMIT 1`).bind(store,provider).first();
  if (!connector || connector.status !== 'active' || !connector.bridge_key_hash) return json({ error:'활성화된 Bridge를 찾을 수 없습니다.' },403,request,allowed);
  if ((await sha256(key)) !== connector.bridge_key_hash) return json({ error:'Bridge 인증에 실패했습니다.' },403,request,allowed);
  const template = await env.DB.prepare(`SELECT tenant_slug,identity_salt FROM marketing_workspace_templates
    WHERE workspace_type='store' AND workspace_key=? LIMIT 1`).bind(store).first();
  if (!template) return json({ error:'CRM 템플릿이 준비되지 않았습니다.' },409,request,allowed);
  const orders = Array.isArray(body?.orders) ? body.orders.slice(0,100) : [];
  if (!orders.length) return json({ error:'가져올 주문이 없습니다.' },400,request,allowed);
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(`SELECT DISTINCT customer_key FROM marketing_events
    WHERE workspace_type='store' AND workspace_key=? AND customer_key<>'' AND event_type IN ('order','repeat_order')`).bind(store).all();
  const seen = new Set((existing.results || []).map(row => String(row.customer_key || '')).filter(Boolean));
  const statements = [];
  for (const item of orders) {
    const externalRefRaw = boundedText(item?.externalRef,160);
    if (!externalRefRaw) continue;
    const occurred = new Date(item?.occurredAt || now);
    if (Number.isNaN(occurred.getTime())) continue;
    const pseudonym = await customerKey(template,item?.customerRef || '');
    const eventType = pseudonym && seen.has(pseudonym) ? 'repeat_order' : 'order';
    if (pseudonym) seen.add(pseudonym);
    const value = Math.max(0,Math.min(1000000000,Math.floor(Number(item?.valueKrw || item?.total || 0))));
    const source = normalizeSlug(item?.source || provider,provider);
    const channel = normalizeSlug(item?.channel || (provider === 'pos_bridge' ? 'pos' : provider),provider);
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO marketing_events
      (workspace_type,workspace_key,tenant_slug,store_id,customer_key,event_type,channel,campaign_id,value_krw,quantity,consent_scope,source,external_ref,metadata_json,occurred_at,created_at)
      VALUES ('store',?,?,?,?,?,?,NULL,?,1,'unknown',?,?,'{}',?,?)`)
      .bind(store,template.tenant_slug,store,pseudonym,eventType,channel,value,source,`${provider}:${externalRefRaw}`.slice(0,180),occurred.toISOString(),now));
  }
  const results = statements.length ? await env.DB.batch(statements) : [];
  const inserted = results.reduce((sum,item) => sum + Number(item?.meta?.changes || 0),0);
  await env.DB.prepare(`UPDATE marketing_data_connectors SET last_sync_at=?,last_success_at=?,last_error='',synced_records=synced_records+?,updated_at=? WHERE id=?`)
    .bind(now,now,inserted,now,connector.id).run();
  return json({ ok:true,storeId:store,provider,accepted:statements.length,inserted,deduplicated:statements.length-inserted,safety:{ rawCustomerIdentityStored:false,externalWriteBack:false } },202,request,allowed);
}

export async function handleMarketingOrderConnectors(request, env) {
  if (!env.DB) return json({ error:'Marketing 커넥터 데이터베이스가 준비되지 않았습니다.' },503,request,false);
  const origin = request.headers.get('origin');
  const allowed = originAllowed(origin,env);
  if (origin && !allowed) return json({ error:'허용되지 않은 요청입니다.' },403,request,false);
  if (request.method === 'OPTIONS') return new Response(null,{ status:204,headers:cors(origin,allowed) });
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/marketing/connectors/status') return connectorStatus(request,env,allowed);
  if (request.method === 'POST' && path === '/api/marketing/connectors/supabase-orders/sync') return syncSupabaseOrders(request,env,allowed);
  if (request.method === 'POST' && path === '/api/marketing/connectors/bridge/pair') return pairBridge(request,env,allowed);
  if (request.method === 'POST' && path === '/api/marketing/connectors/bridge/ingest') return bridgeIngest(request,env,allowed);
  return null;
}
