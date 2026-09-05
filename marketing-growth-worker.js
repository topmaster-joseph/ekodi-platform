import { WorkerEntrypoint } from 'cloudflare:workers';
import { runMallPromotionAutomation } from './mall-promotion-automation.js';
import { runMallSalesIntelligence } from './mall-sales-intelligence.js';
import { d1SchemaReady } from './d1-schema-readiness.js';
const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const WRITE_ROLES = new Set(['store_owner','hq_manager','client_admin','client_editor','manager','owner']);
const SUBJECT_TYPES = new Set(['person','tenant','store']);
const META_PROVIDER = 'meta';
const THREADS_PROVIDER = 'threads';
const YOUTUBE_PROVIDER = 'youtube';

const nowIso = () => new Date().toISOString();
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
function safeParse(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }
function safeJson(value, fallback = {}) { try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); } }
function safeUrl(value) {
  const raw = clean(value, 2048);
  if (!raw) return '';
  try { const url = new URL(raw); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
function cors(request, env) {
  const origin = String(request.headers.get('origin') || '');
  const configured = String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  let allowed = !origin || configured.includes(origin);
  if (!allowed) {
    try {
      const host = new URL(origin).hostname;
      allowed = host === 'ekodi.kr' || host === 'admin.ekodi.kr' || host === 'marketing.ekodi.kr' || host === 'my.ekodi.kr' || /^[a-z0-9-]+\.ai\.ekodi\.kr$/i.test(host);
    } catch {}
  }
  const headers = {
    'access-control-allow-headers':'content-type, authorization, idempotency-key',
    'access-control-allow-methods':'GET, POST, OPTIONS',
    'access-control-max-age':'86400',
    vary:'Origin',
  };
  if (origin && allowed) headers['access-control-allow-origin'] = origin;
  return { allowed, headers };
}
function json(request, env, data, status = 200) {
  const { headers } = cors(request, env);
  return new Response(JSON.stringify(data), { status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers} });
}
async function readJson(request) { try { return await request.json(); } catch { return null; } }

async function identityFromRequest(request) {
  const auth = String(request.headers.get('authorization') || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token || token.length > 8192) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`} });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return { id:String(user.id), email };
}
async function resolveSubject(env, identity, type, key) {
  const subjectType = SUBJECT_TYPES.has(String(type || '').toLowerCase()) ? String(type).toLowerCase() : 'person';
  if (subjectType === 'person') return { type:'person', key:identity.id, role:'owner', writable:true };
  if (subjectType === 'tenant') {
    const slug = clean(key,80).toLowerCase();
    if (!slug) return null;
    const tenant = await env.DB.prepare('SELECT id,slug,status FROM customer_tenants WHERE slug=?').bind(slug).first();
    if (!tenant || tenant.status !== 'active') return null;
    const grant = await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id=? AND email=?').bind(tenant.id,identity.email).first();
    if (!grant || Number(grant.enabled) !== 1) return null;
    const role = String(grant.role || '');
    return { type:'tenant', key:String(tenant.slug), role, writable:WRITE_ROLES.has(role) };
  }
  const storeId = clean(key,100);
  if (!storeId) return null;
  const store = await env.DB.prepare('SELECT store_id,tenant_slug,status FROM marketing_store_workspaces WHERE store_id=?').bind(storeId).first();
  if (!store || store.status !== 'active' || !store.tenant_slug) return null;
  const tenant = await env.DB.prepare('SELECT id,slug,status FROM customer_tenants WHERE slug=?').bind(store.tenant_slug).first();
  if (!tenant || tenant.status !== 'active') return null;
  const grant = await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id=? AND email=?').bind(tenant.id,identity.email).first();
  if (!grant || Number(grant.enabled) !== 1) return null;
  const role = String(grant.role || '');
  return { type:'store', key:String(store.store_id), role, writable:WRITE_ROLES.has(role) };
}
function subjectParams(url) { return {type:url.searchParams.get('subject_type') || 'person',key:url.searchParams.get('subject_key') || ''}; }
async function authSubject(request, env, write = false) {
  const identity = await identityFromRequest(request);
  if (!identity) return { error:'AUTH_REQUIRED', status:401 };
  const url = new URL(request.url);
  const params = subjectParams(url);
  const subject = await resolveSubject(env,identity,params.type,params.key);
  if (!subject) return { error:'SUBJECT_FORBIDDEN', status:403 };
  if (write && !subject.writable) return { error:'SUBJECT_READ_ONLY', status:403 };
  return { identity, subject };
}

function bytesToBase64(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
function base64ToBytes(value) {
  const raw = atob(value);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
async function encryptionKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(secret || '')));
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
function providerSecret(env, provider) {
  if (provider === THREADS_PROVIDER) return String(env.THREADS_APP_SECRET || env.META_APP_SECRET || '');
  if (provider === YOUTUBE_PROVIDER) return String(env.MARKETING_OAUTH_VAULT_KEY || env.GOOGLE_CLIENT_SECRET || '');
  return String(env.META_APP_SECRET || '');
}
async function encryptToken(env, provider, token) {
  const secret = providerSecret(env,provider);
  if (!secret) throw new Error('PLATFORM_SECRET_MISSING');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(secret);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(token)));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(encrypted)}`;
}
async function decryptToken(env, provider, ciphertext) {
  const secret = providerSecret(env,provider);
  if (!secret) throw new Error('PLATFORM_SECRET_MISSING');
  const [version,iv64,data64] = String(ciphertext || '').split('.');
  if (version !== 'v1' || !iv64 || !data64) throw new Error('CREDENTIAL_FORMAT_INVALID');
  const key = await encryptionKey(secret);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(iv64)},key,base64ToBytes(data64));
  return new TextDecoder().decode(plain);
}
function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return bytesToBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function publicBase(env) { return String(env.PUBLIC_BASE_URL || 'https://marketing-connect-api.ekodi.kr').replace(/\/$/,''); }
function callbackUrl(env, provider) { return `${publicBase(env)}/oauth/${provider}/callback`; }
function safeReturnUrl(value) {
  const fallback = 'https://admin.ekodi.kr/';
  const raw = clean(value,2048);
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !(url.hostname === 'ekodi.kr' || url.hostname.endsWith('.ekodi.kr'))) return fallback;
    url.hash = '';
    return url.href;
  } catch { return fallback; }
}
function redirectResult(returnUrl, params) {
  const url = new URL(safeReturnUrl(returnUrl));
  Object.entries(params).forEach(([key,value]) => url.searchParams.set(key,String(value)));
  return Response.redirect(url.href,302);
}
async function schemaReady(env) { return d1SchemaReady(env?.DB,['marketing_oauth_states','marketing_oauth_connections','marketing_growth_campaigns']); }
function metaConfigured(env) { return Boolean(env.META_APP_ID && env.META_APP_SECRET); }
function threadsConfigured(env) { return Boolean((env.THREADS_APP_ID || env.META_APP_ID) && (env.THREADS_APP_SECRET || env.META_APP_SECRET)); }
function youtubeConfigured(env) { return Boolean(env.GOOGLE_CLIENT_ID && providerSecret(env,YOUTUBE_PROVIDER) && env.GOOGLE_OAUTH_BROKER); }

async function createOAuthState(env, provider, mode, identity, subject, returnUrl) {
  const state = randomState();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare(`INSERT INTO marketing_oauth_states(state,provider,mode,subject_type,subject_key,actor_id,actor_email,return_url,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(state,provider,mode,subject.type,subject.key,identity.id,identity.email,safeReturnUrl(returnUrl),createdAt,expiresAt).run();
  return state;
}
async function consumeOAuthState(env, state, provider) {
  const row = await env.DB.prepare(`SELECT state,provider,mode,subject_type,subject_key,actor_id,actor_email,return_url,expires_at,used_at
    FROM marketing_oauth_states WHERE state=? AND provider=?`).bind(clean(state,180),provider).first();
  if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) return null;
  await env.DB.prepare('UPDATE marketing_oauth_states SET used_at=? WHERE state=? AND used_at IS NULL').bind(nowIso(),row.state).run();
  return row;
}
async function startMeta(request, env, identity, subject) {
  if (!metaConfigured(env)) return json(request,env,{error:'META_APP_NOT_CONFIGURED',setup:'META_APP_ID + META_APP_SECRET'},503);
  const body = await readJson(request) || {};
  const mode = body.mode === 'paid' ? 'paid' : 'publish';
  const state = await createOAuthState(env,META_PROVIDER,mode,identity,subject,body.returnUrl);
  const scopes = ['pages_show_list','pages_read_engagement','pages_manage_posts','instagram_basic','instagram_content_publish'];
  if (mode === 'paid') scopes.push('ads_read','ads_management','business_management');
  const version = clean(env.META_GRAPH_VERSION || 'v25.0',16);
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set('client_id',String(env.META_APP_ID));
  url.searchParams.set('redirect_uri',callbackUrl(env,META_PROVIDER));
  url.searchParams.set('state',state);
  url.searchParams.set('response_type','code');
  url.searchParams.set('scope',[...new Set(scopes)].join(','));
  return json(request,env,{authorizationUrl:url.href,provider:'meta',mode});
}
async function startThreads(request, env, identity, subject) {
  if (!threadsConfigured(env)) return json(request,env,{error:'THREADS_APP_NOT_CONFIGURED',setup:'THREADS_APP_ID + THREADS_APP_SECRET'},503);
  const body = await readJson(request) || {};
  const state = await createOAuthState(env,THREADS_PROVIDER,'publish',identity,subject,body.returnUrl);
  const appId = env.THREADS_APP_ID || env.META_APP_ID;
  const url = new URL('https://threads.net/oauth/authorize');
  url.searchParams.set('client_id',String(appId));
  url.searchParams.set('redirect_uri',callbackUrl(env,THREADS_PROVIDER));
  url.searchParams.set('state',state);
  url.searchParams.set('response_type','code');
  url.searchParams.set('scope','threads_basic,threads_content_publish,threads_manage_insights,threads_manage_replies');
  return json(request,env,{authorizationUrl:url.href,provider:'threads',mode:'publish'});
}
async function startYouTube(request, env, identity, subject) {
  if (!youtubeConfigured(env)) return json(request,env,{error:'GOOGLE_APP_NOT_CONFIGURED',setup:'Google OAuth broker + encrypted Marketing vault'},503);
  const body = await readJson(request) || {};
  const state = await createOAuthState(env,YOUTUBE_PROVIDER,'publish',identity,subject,body.returnUrl);
  const broker=await env.GOOGLE_OAUTH_BROKER.startYouTubeOAuth({state});
  return json(request,env,{authorizationUrl:String(broker.authorizationUrl||''),provider:'youtube',mode:'publish'});
}
async function fetchJson(url, init = {}) {
  const response = await fetch(url,init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const message = clean(data?.error?.message || data?.error_description || data?.message || `HTTP_${response.status}`,600);
    throw new Error(message || `HTTP_${response.status}`);
  }
  return data;
}
async function refreshYouTubeAccessToken(env, refreshToken) {
  if(!env.GOOGLE_OAUTH_BROKER?.refreshAccessToken) throw new Error('GOOGLE_OAUTH_BROKER_NOT_CONFIGURED');
  return env.GOOGLE_OAUTH_BROKER.refreshAccessToken({refreshToken:String(refreshToken||'')});
}
function graphBase(env) { return `https://graph.facebook.com/${clean(env.META_GRAPH_VERSION || 'v25.0',16)}`; }
async function upsertConnection(env, subject, {provider,resourceType,externalId,displayName,token,expiresAt='',scopes=[],metadata={}}) {
  const cryptoProvider = provider === 'threads' ? THREADS_PROVIDER : provider === 'youtube' ? YOUTUBE_PROVIDER : META_PROVIDER;
  const ciphertext = await encryptToken(env,cryptoProvider,token);
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO marketing_oauth_connections(subject_type,subject_key,provider,resource_type,external_id,display_name,token_ciphertext,token_expires_at,scopes_json,status,metadata_json,last_check_at,last_error,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,'active',?,?, '',?,?)
    ON CONFLICT(subject_type,subject_key,provider,resource_type,external_id) DO UPDATE SET display_name=excluded.display_name,token_ciphertext=excluded.token_ciphertext,token_expires_at=excluded.token_expires_at,scopes_json=excluded.scopes_json,status='active',metadata_json=excluded.metadata_json,last_check_at=excluded.last_check_at,last_error='',updated_at=excluded.updated_at`)
    .bind(subject.type,subject.key,provider,resourceType,externalId,displayName,ciphertext,expiresAt || null,safeJson(scopes,[]),safeJson(metadata,{}),now,now,now).run();
  return env.DB.prepare('SELECT id FROM marketing_oauth_connections WHERE subject_type=? AND subject_key=? AND provider=? AND resource_type=? AND external_id=?')
    .bind(subject.type,subject.key,provider,resourceType,externalId).first();
}
async function upsertPublishChannel(env, subject, {provider,channelType,displayName,externalId,connectionId}) {
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO marketing_publish_channels(subject_type,subject_key,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json,last_check_at,last_error,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'','active',?,?,'',?,?)
    ON CONFLICT(subject_type,subject_key,provider,channel_type,external_account_id) DO UPDATE SET display_name=excluded.display_name,credential_ref='',status='active',config_json=excluded.config_json,last_check_at=excluded.last_check_at,last_error='',updated_at=excluded.updated_at`)
    .bind(subject.type,subject.key,provider,channelType,displayName,externalId,safeJson({credentialMode:'oauth-vault',oauthConnectionId:connectionId}),now,now,now).run();
}
async function metaCallback(request, env) {
  const url = new URL(request.url);
  const state = await consumeOAuthState(env,url.searchParams.get('state') || '',META_PROVIDER);
  if (!state) return new Response('Invalid or expired OAuth state',{status:400});
  if (url.searchParams.get('error')) return redirectResult(state.return_url,{ekodi_connect:'error',provider:'meta',reason:clean(url.searchParams.get('error_description') || url.searchParams.get('error'),160)});
  try {
    const code = clean(url.searchParams.get('code'),4096);
    if (!code) throw new Error('AUTHORIZATION_CODE_MISSING');
    const version = clean(env.META_GRAPH_VERSION || 'v25.0',16);
    const exchange = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    exchange.searchParams.set('client_id',String(env.META_APP_ID));
    exchange.searchParams.set('client_secret',String(env.META_APP_SECRET));
    exchange.searchParams.set('redirect_uri',callbackUrl(env,META_PROVIDER));
    exchange.searchParams.set('code',code);
    const shortToken = await fetchJson(exchange.href);
    const longExchange = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    longExchange.searchParams.set('grant_type','fb_exchange_token');
    longExchange.searchParams.set('client_id',String(env.META_APP_ID));
    longExchange.searchParams.set('client_secret',String(env.META_APP_SECRET));
    longExchange.searchParams.set('fb_exchange_token',String(shortToken.access_token || ''));
    const longTokenData = await fetchJson(longExchange.href).catch(() => shortToken);
    const userToken = String(longTokenData.access_token || shortToken.access_token || '');
    if (!userToken) throw new Error('ACCESS_TOKEN_MISSING');
    const expiresAt = Number(longTokenData.expires_in || shortToken.expires_in || 0) > 0 ? new Date(Date.now() + Number(longTokenData.expires_in || shortToken.expires_in) * 1000).toISOString() : '';
    const subject = {type:state.subject_type,key:state.subject_key};
    const pageUrl = new URL(`${graphBase(env)}/me/accounts`);
    pageUrl.searchParams.set('fields','id,name,access_token,instagram_business_account{id,username,name}');
    pageUrl.searchParams.set('limit','100');
    pageUrl.searchParams.set('access_token',userToken);
    const pagesData = await fetchJson(pageUrl.href);
    let count = 0;
    for (const page of (pagesData.data || [])) {
      if (!page?.id || !page?.access_token) continue;
      const fb = await upsertConnection(env,subject,{provider:'facebook',resourceType:'page',externalId:String(page.id),displayName:clean(page.name || 'Facebook Page',120),token:String(page.access_token),expiresAt,scopes:['pages_manage_posts','pages_read_engagement'],metadata:{source:'meta_oauth'}});
      if (fb?.id) {
        await upsertPublishChannel(env,subject,{provider:'facebook',channelType:'page',displayName:clean(page.name || 'Facebook Page',120),externalId:String(page.id),connectionId:Number(fb.id)});
        count += 1;
      }
      const ig = page.instagram_business_account;
      if (ig?.id) {
        const display = clean(ig.username ? `@${ig.username}` : ig.name || 'Instagram',120);
        const igRow = await upsertConnection(env,subject,{provider:'instagram',resourceType:'business',externalId:String(ig.id),displayName:display,token:String(page.access_token),expiresAt,scopes:['instagram_basic','instagram_content_publish'],metadata:{pageId:String(page.id),source:'meta_oauth'}});
        if (igRow?.id) {
          await upsertPublishChannel(env,subject,{provider:'instagram',channelType:'business',displayName:display,externalId:String(ig.id),connectionId:Number(igRow.id)});
          count += 1;
        }
      }
    }
    if (state.mode === 'paid') {
      const adsUrl = new URL(`${graphBase(env)}/me/adaccounts`);
      adsUrl.searchParams.set('fields','id,name,account_id,account_status');
      adsUrl.searchParams.set('limit','100');
      adsUrl.searchParams.set('access_token',userToken);
      const ads = await fetchJson(adsUrl.href).catch(() => ({data:[]}));
      for (const account of (ads.data || [])) {
        if (!account?.id) continue;
        const row = await upsertConnection(env,subject,{provider:'facebook_ads',resourceType:'ad_account',externalId:String(account.id),displayName:clean(account.name || account.id,120),token:userToken,expiresAt,scopes:['ads_read','ads_management'],metadata:{accountId:String(account.account_id || ''),accountStatus:account.account_status,source:'meta_oauth'}});
        if (row?.id) count += 1;
      }
    }
    return redirectResult(state.return_url,{ekodi_connect:'success',provider:'meta',connections:count});
  } catch (error) {
    return redirectResult(state.return_url,{ekodi_connect:'error',provider:'meta',reason:clean(error.message,160)});
  }
}
async function threadsCallback(request, env) {
  const url = new URL(request.url);
  const state = await consumeOAuthState(env,url.searchParams.get('state') || '',THREADS_PROVIDER);
  if (!state) return new Response('Invalid or expired OAuth state',{status:400});
  if (url.searchParams.get('error')) return redirectResult(state.return_url,{ekodi_connect:'error',provider:'threads',reason:clean(url.searchParams.get('error_description') || url.searchParams.get('error'),160)});
  try {
    const code = clean(url.searchParams.get('code'),4096);
    if (!code) throw new Error('AUTHORIZATION_CODE_MISSING');
    const appId = env.THREADS_APP_ID || env.META_APP_ID;
    const appSecret = env.THREADS_APP_SECRET || env.META_APP_SECRET;
    const form = new URLSearchParams({client_id:String(appId),client_secret:String(appSecret),grant_type:'authorization_code',redirect_uri:callbackUrl(env,THREADS_PROVIDER),code});
    const short = await fetchJson('https://graph.threads.net/oauth/access_token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form});
    const longUrl = new URL('https://graph.threads.net/access_token');
    longUrl.searchParams.set('grant_type','th_exchange_token');
    longUrl.searchParams.set('client_secret',String(appSecret));
    longUrl.searchParams.set('access_token',String(short.access_token || ''));
    const long = await fetchJson(longUrl.href).catch(() => short);
    const token = String(long.access_token || short.access_token || '');
    if (!token) throw new Error('ACCESS_TOKEN_MISSING');
    const meUrl = new URL('https://graph.threads.net/v1.0/me');
    meUrl.searchParams.set('fields','id,username,name');
    meUrl.searchParams.set('access_token',token);
    const me = await fetchJson(meUrl.href);
    if (!me?.id) throw new Error('THREADS_PROFILE_NOT_FOUND');
    const expiresAt = Number(long.expires_in || short.expires_in || 0) > 0 ? new Date(Date.now() + Number(long.expires_in || short.expires_in) * 1000).toISOString() : '';
    const subject = {type:state.subject_type,key:state.subject_key};
    const display = clean(me.username ? `@${me.username}` : me.name || 'Threads',120);
    const connection = await upsertConnection(env,subject,{provider:'threads',resourceType:'profile',externalId:String(me.id),displayName:display,token,expiresAt,scopes:['threads_basic','threads_content_publish','threads_manage_insights'],metadata:{source:'threads_oauth'}});
    if (connection?.id) await upsertPublishChannel(env,subject,{provider:'threads',channelType:'profile',displayName:display,externalId:String(me.id),connectionId:Number(connection.id)});
    return redirectResult(state.return_url,{ekodi_connect:'success',provider:'threads',connections:connection?.id ? 1 : 0});
  } catch (error) {
    return redirectResult(state.return_url,{ekodi_connect:'error',provider:'threads',reason:clean(error.message,160)});
  }
}

async function youtubeCallback(request, env) {
  const url = new URL(request.url);
  const state = await consumeOAuthState(env,url.searchParams.get('state') || '',YOUTUBE_PROVIDER);
  if (!state) return new Response('Invalid or expired OAuth state',{status:400});
  if (url.searchParams.get('error')) return redirectResult(state.return_url,{ekodi_connect:'error',provider:'youtube',reason:clean(url.searchParams.get('error_description') || url.searchParams.get('error'),160)});
  try {
    const ticket = clean(url.searchParams.get('ticket'),512);
    if (!ticket) throw new Error('GOOGLE_OAUTH_TICKET_REQUIRED');
    const tokenData = await env.GOOGLE_OAUTH_BROKER.consumeYouTubeTicket({ticket});
    const accessToken = String(tokenData.access_token || '');
    const refreshToken = String(tokenData.refresh_token || '');
    if (!accessToken || !refreshToken) throw new Error('YOUTUBE_REFRESH_TOKEN_MISSING');
    const channels = await fetchJson('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50',{headers:{authorization:`Bearer ${accessToken}`}});
    const subject = {type:state.subject_type,key:state.subject_key};
    const expiresAt = Number(tokenData.expires_in || 0) > 0 ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString() : '';
    let count = 0;
    for (const channel of (channels.items || [])) {
      if (!channel?.id) continue;
      const display = clean(channel.snippet?.title || 'YouTube',120);
      const token = safeJson({accessToken,refreshToken,expiresAt});
      const row = await upsertConnection(env,subject,{provider:'youtube',resourceType:'channel',externalId:String(channel.id),displayName:display,token,expiresAt,scopes:['youtube.upload','youtube.readonly'],metadata:{source:'google_oauth'}});
      if (row?.id) { await upsertPublishChannel(env,subject,{provider:'youtube',channelType:'channel',displayName:display,externalId:String(channel.id),connectionId:Number(row.id)}); count += 1; }
    }
    return redirectResult(state.return_url,{ekodi_connect:'success',provider:'youtube',connections:count});
  } catch (error) { return redirectResult(state.return_url,{ekodi_connect:'error',provider:'youtube',reason:clean(error.message,160)}); }
}

async function listConnections(request, env, subject) {
  const result = await env.DB.prepare(`SELECT id,provider,resource_type,external_id,display_name,token_expires_at,scopes_json,status,metadata_json,last_check_at,last_error,created_at,updated_at
    FROM marketing_oauth_connections WHERE subject_type=? AND subject_key=? ORDER BY provider,display_name`).bind(subject.type,subject.key).all();
  const connections = (result.results || []).map(row => ({...row,scopes:safeParse(row.scopes_json,[]),metadata:safeParse(row.metadata_json,{})}));
  return json(request,env,{connections,platform:{metaConfigured:metaConfigured(env),threadsConfigured:threadsConfigured(env),youtubeConfigured:youtubeConfigured(env),credentialMode:'central_oauth_vault'}});
}
async function connectionWithToken(env, subject, id) {
  const row = await env.DB.prepare(`SELECT id,provider,resource_type,external_id,display_name,token_ciphertext,status,metadata_json
    FROM marketing_oauth_connections WHERE id=? AND subject_type=? AND subject_key=?`).bind(Number(id),subject.type,subject.key).first();
  if (!row || row.status !== 'active') return null;
  const cryptoProvider = row.provider === 'threads' ? THREADS_PROVIDER : row.provider === 'youtube' ? YOUTUBE_PROVIDER : META_PROVIDER;
  const token = await decryptToken(env,cryptoProvider,row.token_ciphertext);
  return {...row,metadata:safeParse(row.metadata_json,{}),token};
}
function campaignSlug(value) {
  const base = clean(value || `campaign_${new Date().toISOString().slice(0,10)}`,80).toLowerCase();
  const slug = base.replace(/[^a-z0-9가-힣_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,64);
  return slug || `campaign_${Date.now()}`;
}
function trackedUrl(raw, provider, campaign) {
  const target = safeUrl(raw);
  if (!target) return '';
  const url = new URL(target);
  if (!url.searchParams.has('utm_source')) url.searchParams.set('utm_source',provider);
  if (!url.searchParams.has('utm_medium')) url.searchParams.set('utm_medium','social');
  if (!url.searchParams.has('utm_campaign')) url.searchParams.set('utm_campaign',campaignSlug(campaign));
  return url.href;
}
async function ensureChannelId(env, subject, connection) {
  const channelType = connection.provider === 'facebook' ? 'page' : connection.provider === 'instagram' ? 'business' : connection.provider === 'youtube' ? 'channel' : 'profile';
  await upsertPublishChannel(env,subject,{provider:connection.provider,channelType,displayName:connection.display_name,externalId:connection.external_id,connectionId:Number(connection.id)});
  const row = await env.DB.prepare(`SELECT id FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? AND provider=? AND channel_type=? AND external_account_id=?`)
    .bind(subject.type,subject.key,connection.provider,channelType,connection.external_id).first();
  return Number(row?.id || 0);
}
async function insertContent(env, subject, identity, content) {
  const now = nowIso();
  const result = await env.DB.prepare(`INSERT INTO marketing_content_items(subject_type,subject_key,title,content_type,caption,asset_url,link_url,content_json,source,approval_state,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,'approved',?,?,?)`).bind(subject.type,subject.key,clean(content.title,240),'social_post',clean(content.caption,12000),safeUrl(content.imageUrl),safeUrl(content.linkUrl),safeJson({campaignName:content.campaignName || ''}),'human',identity.email,now,now).run();
  return Number(result.meta?.last_row_id || 0);
}
async function insertJob(env, subject, contentId, channelId, status, error = '', externalId = '', externalUrl = '', providerResponse = {}) {
  const now = nowIso();
  const result = await env.DB.prepare(`INSERT INTO marketing_publication_jobs(subject_type,subject_key,content_id,channel_id,schedule_kind,scheduled_at,recurrence_rule,status,requested_by,attempt_count,max_attempts,external_post_id,external_post_url,provider_response_json,last_error,published_at,created_at,updated_at)
    VALUES(?,?,?,?,'immediate',?,'',?,'human',1,1,?,?,?,?,?,?,?,?)`).bind(subject.type,subject.key,contentId,channelId,now,status,externalId,externalUrl,safeJson(providerResponse,{}),clean(error,1000),status === 'published' ? now : null,now,now).run();
  return Number(result.meta?.last_row_id || 0);
}
async function publishFacebook(env, connection, content) {
  const link = trackedUrl(content.linkUrl,'facebook',content.campaignName);
  const message = [clean(content.caption,10000),link].filter(Boolean).join('\n\n');
  if (content.imageUrl) {
    const form = new URLSearchParams({url:safeUrl(content.imageUrl),caption:message,published:'true',access_token:connection.token});
    const data = await fetchJson(`${graphBase(env)}/${encodeURIComponent(connection.external_id)}/photos`,{method:'POST',body:form});
    return {id:String(data.post_id || data.id || ''),url:data.post_id ? `https://www.facebook.com/${data.post_id}` : '',data};
  }
  const form = new URLSearchParams({message:clean(content.caption,10000),access_token:connection.token});
  if (link) form.set('link',link);
  const data = await fetchJson(`${graphBase(env)}/${encodeURIComponent(connection.external_id)}/feed`,{method:'POST',body:form});
  return {id:String(data.id || ''),url:data.id ? `https://www.facebook.com/${data.id}` : '',data};
}
async function publishInstagram(env, connection, content) {
  const image = safeUrl(content.imageUrl);
  if (!image) throw new Error('INSTAGRAM_IMAGE_REQUIRED');
  const link = trackedUrl(content.linkUrl,'instagram',content.campaignName);
  const caption = [clean(content.caption,2000),link].filter(Boolean).join('\n\n');
  const createForm = new URLSearchParams({image_url:image,caption,access_token:connection.token});
  const container = await fetchJson(`${graphBase(env)}/${encodeURIComponent(connection.external_id)}/media`,{method:'POST',body:createForm});
  if (!container.id) throw new Error('INSTAGRAM_CONTAINER_FAILED');
  const publishForm = new URLSearchParams({creation_id:String(container.id),access_token:connection.token});
  const published = await fetchJson(`${graphBase(env)}/${encodeURIComponent(connection.external_id)}/media_publish`,{method:'POST',body:publishForm});
  let permalink = '';
  if (published.id) {
    const infoUrl = new URL(`${graphBase(env)}/${published.id}`);
    infoUrl.searchParams.set('fields','permalink');
    infoUrl.searchParams.set('access_token',connection.token);
    const info = await fetchJson(infoUrl.href).catch(() => ({}));
    permalink = safeUrl(info.permalink);
  }
  return {id:String(published.id || ''),url:permalink,data:published};
}
async function publishThreads(connection, content) {
  const link = trackedUrl(content.linkUrl,'threads',content.campaignName);
  const text = [clean(content.caption,450),link].filter(Boolean).join('\n\n');
  const form = new URLSearchParams({access_token:connection.token,text});
  const image = safeUrl(content.imageUrl);
  if (image) { form.set('media_type','IMAGE'); form.set('image_url',image); }
  else form.set('media_type','TEXT');
  const container = await fetchJson(`https://graph.threads.net/v1.0/${encodeURIComponent(connection.external_id)}/threads`,{method:'POST',body:form});
  if (!container.id) throw new Error('THREADS_CONTAINER_FAILED');
  const publishForm = new URLSearchParams({creation_id:String(container.id),access_token:connection.token});
  const published = await fetchJson(`https://graph.threads.net/v1.0/${encodeURIComponent(connection.external_id)}/threads_publish`,{method:'POST',body:publishForm});
  let permalink = '';
  if (published.id) {
    const infoUrl = new URL(`https://graph.threads.net/v1.0/${published.id}`);
    infoUrl.searchParams.set('fields','permalink');
    infoUrl.searchParams.set('access_token',connection.token);
    const info = await fetchJson(infoUrl.href).catch(() => ({}));
    permalink = safeUrl(info.permalink);
  }
  return {id:String(published.id || ''),url:permalink,data:published};
}
async function youtubeAccessToken(env, connection) {
  const saved = safeParse(connection.token,{});
  const refreshToken = String(saved.refreshToken || '');
  if (!refreshToken) throw new Error('YOUTUBE_REFRESH_TOKEN_MISSING');
  const data = await refreshYouTubeAccessToken(env,refreshToken);
  if (!data.access_token) throw new Error('YOUTUBE_ACCESS_TOKEN_MISSING');
  return String(data.access_token);
}
async function publishYouTube(env, connection, content) {
  const assetUrl = safeUrl(content.imageUrl);
  if (!assetUrl) throw new Error('YOUTUBE_VIDEO_REQUIRED');
  const accessToken = await youtubeAccessToken(env,connection);
  const asset = await fetch(assetUrl);
  if (!asset.ok) throw new Error(`YOUTUBE_ASSET_FETCH_${asset.status}`);
  const bytes = await asset.arrayBuffer();
  const contentType = asset.headers.get('content-type') || 'video/mp4';
  const link = trackedUrl(content.linkUrl,'youtube',content.campaignName);
  const title = clean(content.title || content.campaignName || 'EKODI',100);
  const description = [clean(content.caption,4800),link].filter(Boolean).join('\n\n');
  const metadata = {snippet:{title,description,categoryId:'22'},status:{privacyStatus:'private',selfDeclaredMadeForKids:false}};
  const begin = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json; charset=UTF-8','x-upload-content-type':contentType,'x-upload-content-length':String(bytes.byteLength)},body:JSON.stringify(metadata)});
  const beginData = await begin.clone().json().catch(()=>({}));
  const location = begin.headers.get('location');
  if (!begin.ok || !location) throw new Error(beginData?.error?.message || `YOUTUBE_UPLOAD_START_${begin.status}`);
  const uploaded = await fetch(location,{method:'PUT',headers:{authorization:`Bearer ${accessToken}`,'content-type':contentType,'content-length':String(bytes.byteLength)},body:bytes});
  const data = await uploaded.json().catch(()=>({}));
  if (!uploaded.ok || !data.id) throw new Error(data?.error?.message || `YOUTUBE_UPLOAD_${uploaded.status}`);
  return {id:String(data.id),url:`https://www.youtube.com/watch?v=${encodeURIComponent(data.id)}`,data:{id:data.id,privacyStatus:'private'}};
}

async function executePublish(request, env, identity, subject, body) {
  const ids = [...new Set((Array.isArray(body.connectionIds) ? body.connectionIds : []).map(Number).filter(Number.isInteger))].slice(0,20);
  const content = body.content || {};
  if (!ids.length || (!clean(content.caption,12000) && !clean(content.title,240))) return json(request,env,{error:'CONTENT_AND_CONNECTIONS_REQUIRED'},400);
  const contentId = await insertContent(env,subject,identity,{...content,campaignName:body.campaignName || content.campaignName || ''});
  if (!contentId) return json(request,env,{error:'CONTENT_INSERT_FAILED'},500);
  const results = [];
  for (const id of ids) {
    let connection;
    let channelId = 0;
    try {
      connection = await connectionWithToken(env,subject,id);
      if (!connection || !['facebook','instagram','threads','youtube'].includes(connection.provider)) throw new Error('PUBLISH_CONNECTION_UNAVAILABLE');
      channelId = await ensureChannelId(env,subject,connection);
      if (!channelId) throw new Error('CHANNEL_LEDGER_UNAVAILABLE');
      let published;
      const payload = {...content,campaignName:body.campaignName || content.campaignName || ''};
      if (connection.provider === 'facebook') published = await publishFacebook(env,connection,payload);
      else if (connection.provider === 'instagram') published = await publishInstagram(env,connection,payload);
      else if (connection.provider === 'threads') published = await publishThreads(connection,payload);
      else published = await publishYouTube(env,connection,payload);
      await insertJob(env,subject,contentId,channelId,'published','',published.id,published.url,published.data);
      results.push({connectionId:id,provider:connection.provider,status:'published',externalPostId:published.id,externalPostUrl:published.url});
    } catch (error) {
      if (channelId) await insertJob(env,subject,contentId,channelId,'failed',error.message);
      results.push({connectionId:id,provider:connection?.provider || '',status:'failed',error:clean(error.message,400)});
    }
  }
  return json(request,env,{ok:results.some(row => row.status === 'published'),contentId,results},results.some(row => row.status === 'published') ? 200 : 502);
}

async function createPromotion(request, env, identity, subject) {
  const body = await readJson(request);
  if (!body) return json(request,env,{error:'INVALID_JSON'},400);
  const mode = body.mode === 'paid' ? 'paid' : 'organic';
  const name = clean(body.name || body.campaignName,120);
  if (!name) return json(request,env,{error:'CAMPAIGN_NAME_REQUIRED'},400);
  const ids = [...new Set((Array.isArray(body.connectionIds) ? body.connectionIds : []).map(Number).filter(Number.isInteger))].slice(0,20);
  const daily = Math.max(0,Math.round(Number(body.dailyBudgetKrw || 0)));
  const total = Math.max(0,Math.round(Number(body.totalBudgetKrw || 0)));
  const maxDaily = Math.max(1000,Number(env.MAX_DAILY_AD_BUDGET_KRW || 100000));
  const maxTotal = Math.max(maxDaily,Number(env.MAX_TOTAL_AD_BUDGET_KRW || 1000000));
  if (mode === 'paid' && (!body.adAccountConnectionId || daily < 1000 || total < daily || daily > maxDaily || total > maxTotal)) {
    return json(request,env,{error:'PAID_BUDGET_OR_ACCOUNT_INVALID',limits:{maxDailyKrw:maxDaily,maxTotalKrw:maxTotal}},400);
  }
  if (mode === 'organic' && !ids.length) return json(request,env,{error:'ORGANIC_CONNECTION_REQUIRED'},400);
  const now = nowIso();
  const content = body.content || {};
  const result = await env.DB.prepare(`INSERT INTO marketing_growth_campaigns(subject_type,subject_key,mode,provider,name,objective,target_url,utm_campaign,daily_budget_krw,total_budget_krw,approval_state,status,connection_ids_json,ad_account_connection_id,content_json,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,'draft','draft',?,?,?,?,?,?)`).bind(subject.type,subject.key,mode,mode === 'paid' ? 'facebook_ads' : 'multi',name,clean(body.objective || 'traffic',80),safeUrl(body.targetUrl || content.linkUrl),campaignSlug(body.utmCampaign || name),daily,total,safeJson(ids,[]),mode === 'paid' ? Number(body.adAccountConnectionId) : null,safeJson(content,{}),identity.email,now,now).run();
  const campaignId = Number(result.meta?.last_row_id || 0);
  if (mode === 'organic' && body.executeNow === true) {
    const publishBody = {connectionIds:ids,campaignName:name,content:{...content,linkUrl:safeUrl(body.targetUrl || content.linkUrl)}};
    const response = await executePublish(request,env,identity,subject,publishBody);
    const payload = await response.json().catch(() => ({}));
    const succeeded = Array.isArray(payload.results) && payload.results.some(row => row.status === 'published');
    await env.DB.prepare('UPDATE marketing_growth_campaigns SET approval_state=?,status=?,metrics_json=?,last_error=?,updated_at=? WHERE id=?')
      .bind('approved',succeeded ? 'active' : 'failed',safeJson({publicationResults:payload.results || []}),succeeded ? '' : clean(payload.error || 'PUBLISH_FAILED',600),nowIso(),campaignId).run();
    return json(request,env,{ok:succeeded,campaignId,mode,publication:payload},succeeded ? 200 : 502);
  }
  return json(request,env,{ok:true,campaignId,mode,status:'draft',spendKrw:0});
}
async function listPromotions(request, env, subject) {
  const result = await env.DB.prepare(`SELECT id,mode,provider,name,objective,target_url,utm_campaign,daily_budget_krw,total_budget_krw,approval_state,status,connection_ids_json,ad_account_connection_id,content_json,external_campaign_id,metrics_json,last_error,created_by,approved_by,created_at,updated_at
    FROM marketing_growth_campaigns WHERE subject_type=? AND subject_key=? ORDER BY id DESC LIMIT 100`).bind(subject.type,subject.key).all();
  const campaigns = (result.results || []).map(row => ({...row,connectionIds:safeParse(row.connection_ids_json,[]),content:safeParse(row.content_json,{}),metrics:safeParse(row.metrics_json,{})}));
  return json(request,env,{campaigns,paidGuard:{activationImplemented:false,prepareCreatesPausedCampaignOnly:true,maxDailyKrw:Number(env.MAX_DAILY_AD_BUDGET_KRW || 100000),maxTotalKrw:Number(env.MAX_TOTAL_AD_BUDGET_KRW || 1000000)}});
}
async function approvePromotion(request, env, identity, subject, id) {
  const body = await readJson(request) || {};
  if (body.approvalText !== '광고비 집행 승인') return json(request,env,{error:'EXPLICIT_AD_SPEND_APPROVAL_REQUIRED'},409);
  const row = await env.DB.prepare(`SELECT id,mode,status FROM marketing_growth_campaigns WHERE id=? AND subject_type=? AND subject_key=?`).bind(Number(id),subject.type,subject.key).first();
  if (!row || row.mode !== 'paid') return json(request,env,{error:'PAID_CAMPAIGN_NOT_FOUND'},404);
  await env.DB.prepare(`UPDATE marketing_growth_campaigns SET approval_state='approved',status='ready',approved_by=?,updated_at=? WHERE id=?`).bind(identity.email,nowIso(),Number(id)).run();
  return json(request,env,{ok:true,campaignId:Number(id),approvalState:'approved',status:'ready',spendKrw:0});
}
async function preparePaidPromotion(request, env, identity, subject, id) {
  const row = await env.DB.prepare(`SELECT id,name,objective,target_url,utm_campaign,daily_budget_krw,total_budget_krw,approval_state,status,ad_account_connection_id,external_campaign_id
    FROM marketing_growth_campaigns WHERE id=? AND subject_type=? AND subject_key=? AND mode='paid'`).bind(Number(id),subject.type,subject.key).first();
  if (!row) return json(request,env,{error:'PAID_CAMPAIGN_NOT_FOUND'},404);
  if (row.approval_state !== 'approved') return json(request,env,{error:'CAMPAIGN_APPROVAL_REQUIRED'},409);
  if (row.external_campaign_id) return json(request,env,{ok:true,campaignId:Number(id),externalCampaignId:row.external_campaign_id,status:'paused',spendKrw:0});
  const connection = await connectionWithToken(env,subject,row.ad_account_connection_id);
  if (!connection || connection.provider !== 'facebook_ads') return json(request,env,{error:'AD_ACCOUNT_CONNECTION_UNAVAILABLE'},409);
  try {
    const form = new URLSearchParams({name:clean(`EKODI · ${row.name}`,120),objective:'OUTCOME_TRAFFIC',status:'PAUSED',special_ad_categories:'[]',access_token:connection.token});
    const created = await fetchJson(`${graphBase(env)}/${encodeURIComponent(connection.external_id)}/campaigns`,{method:'POST',body:form});
    if (!created.id) throw new Error('META_CAMPAIGN_CREATE_FAILED');
    await env.DB.prepare(`UPDATE marketing_growth_campaigns SET status='paused',external_campaign_id=?,metrics_json=?,last_error='',updated_at=? WHERE id=?`)
      .bind(String(created.id),safeJson({providerStatus:'PAUSED',spendKrw:0,preparedBy:identity.email}),nowIso(),Number(id)).run();
    return json(request,env,{ok:true,campaignId:Number(id),externalCampaignId:String(created.id),status:'paused',spendKrw:0,note:'광고 캠페인 골격만 PAUSED로 생성했습니다. 광고비는 집행되지 않습니다.'});
  } catch (error) {
    await env.DB.prepare(`UPDATE marketing_growth_campaigns SET status='failed',last_error=?,updated_at=? WHERE id=?`).bind(clean(error.message,1000),nowIso(),Number(id)).run();
    return json(request,env,{error:'PAID_PREPARE_FAILED',detail:clean(error.message,500)},502);
  }
}

export class MarketingGrowthPublisher extends WorkerEntrypoint {
  async runGrowthCycle(input = {}) {
    const reason = clean(input?.reason || 'shared-publishing-cron',80);
    const intelligence = await runMallSalesIntelligence(this.env,{reason});
    const promotion = await runMallPromotionAutomation(this.env,{reason});
    return {ok:Boolean(intelligence?.ok || intelligence?.status === 'schema_required') && Boolean(promotion?.ok || promotion?.status === 'schema_required'),intelligence,promotion};
  }

  async publishFromVault(input = {}) {
    const env = this.env;
    if (!(await schemaReady(env))) throw Object.assign(new Error('SCHEMA_NOT_READY'), { code:'SCHEMA_NOT_READY' });
    const subject = { type:clean(input?.subject?.type,20), key:clean(input?.subject?.key,160) };
    const connectionId = Number(input?.connectionId || 0);
    const provider = clean(input?.provider,40).toLowerCase();
    if (!subject.type || !subject.key || !Number.isInteger(connectionId) || connectionId <= 0) throw Object.assign(new Error('VAULT_PUBLISH_INPUT_INVALID'), { code:'VAULT_PUBLISH_INPUT_INVALID' });
    const connection = await connectionWithToken(env, subject, connectionId);
    if (!connection || connection.provider !== provider || !['facebook','instagram','threads','youtube'].includes(provider)) throw Object.assign(new Error('PUBLISH_CONNECTION_UNAVAILABLE'), { code:'PUBLISH_CONNECTION_UNAVAILABLE' });
    const raw = input?.content || {};
    const content = { title:clean(raw.title,240), caption:clean(raw.caption,12000), imageUrl:safeUrl(raw.imageUrl), linkUrl:safeUrl(raw.linkUrl), campaignName:clean(raw.campaignName,120) };
    let published;
    if (provider === 'facebook') published = await publishFacebook(env, connection, content);
    else if (provider === 'instagram') published = await publishInstagram(env, connection, content);
    else if (provider === 'threads') published = await publishThreads(connection, content);
    else published = await publishYouTube(env, connection, content);
    return { id:String(published?.id || ''), url:safeUrl(published?.url), provider };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { allowed, headers } = cors(request,env);
    if (request.method === 'OPTIONS') return new Response(null,{status:allowed ? 204 : 403,headers});
    if (url.pathname === '/admin' || url.pathname === '/admin/') return Response.redirect('https://admin.ekodi.kr/?route=marketing-ai&source=marketing-connect-api.ekodi.kr',307);
    if (!allowed) return json(request,env,{error:'ORIGIN_FORBIDDEN'},403);
    if (url.pathname === '/health' && request.method === 'GET') {
      const ready = await schemaReady(env);
      return json(request,env,{service:'ekodi-marketing-growth',ok:ready,schemaReady:ready,oauthBroker:true,encryptedVault:true,organicPublishing:true,paidPromotionDrafts:true,paidActivation:false,platform:{metaConfigured:metaConfigured(env),threadsConfigured:threadsConfigured(env),youtubeConfigured:youtubeConfigured(env)},graphVersion:clean(env.META_GRAPH_VERSION || 'v25.0',16)},ready ? 200 : 503);
    }
    if (url.pathname === '/oauth/meta/callback' && request.method === 'GET') return metaCallback(request,env);
    if (url.pathname === '/oauth/threads/callback' && request.method === 'GET') return threadsCallback(request,env);
    if (url.pathname === '/oauth/youtube/callback' && request.method === 'GET') return youtubeCallback(request,env);
    if (!(await schemaReady(env))) return json(request,env,{error:'SCHEMA_NOT_READY'},503);

    const write = request.method !== 'GET';
    const auth = await authSubject(request,env,write);
    if (auth.error) return json(request,env,{error:auth.error},auth.status);
    const {identity,subject} = auth;

    if (url.pathname === '/v1/connect/meta/start' && request.method === 'POST') return startMeta(request,env,identity,subject);
    if (url.pathname === '/v1/connect/threads/start' && request.method === 'POST') return startThreads(request,env,identity,subject);
    if (url.pathname === '/v1/connect/youtube/start' && request.method === 'POST') return startYouTube(request,env,identity,subject);
    if (url.pathname === '/v1/connections' && request.method === 'GET') return listConnections(request,env,subject);
    if (url.pathname === '/v1/publish' && request.method === 'POST') {
      const body = await readJson(request);
      if (!body) return json(request,env,{error:'INVALID_JSON'},400);
      return executePublish(request,env,identity,subject,body);
    }
    if (url.pathname === '/v1/promotions' && request.method === 'GET') return listPromotions(request,env,subject);
    if (url.pathname === '/v1/promotions' && request.method === 'POST') return createPromotion(request,env,identity,subject);
    const approve = url.pathname.match(/^\/v1\/promotions\/(\d+)\/approve$/);
    if (approve && request.method === 'POST') return approvePromotion(request,env,identity,subject,approve[1]);
    const prepare = url.pathname.match(/^\/v1\/promotions\/(\d+)\/prepare$/);
    if (prepare && request.method === 'POST') return preparePaidPromotion(request,env,identity,subject,prepare[1]);
    return json(request,env,{error:'NOT_FOUND'},404);
  }
};
