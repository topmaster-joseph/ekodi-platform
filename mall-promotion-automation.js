import { createOpenAiProvider } from './openai-provider-adapter.js';

const SUBJECT_TYPE = 'tenant';
const SUBJECT_KEY = 'ekodibiz';
const ACCOUNT_ID = 'coupang-ekodibiz';
const STOREFRONT = 'ekodi-mall';
const AFFILIATE_DISCLOSURE = '쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
const PROVIDERS = Object.freeze(['facebook','instagram','threads']);
const RUN_AFTER_KST_HOUR = 8;
const MAX_DAILY_CHANNELS = 3;

const clean = (value,max=240) => String(value ?? '').trim().slice(0,max);
const nowIso = () => new Date().toISOString();
function safeJson(value,fallback={}) { try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); } }
function safeParse(value,fallback={}) { try { return JSON.parse(value || ''); } catch { return fallback; } }
function safeUrl(value) { const raw=clean(value,2048); if(!raw) return ''; try { const url=new URL(raw); return url.protocol==='https:'?url.href:''; } catch { return ''; } }
function slug(value) { return clean(value,160).toLowerCase().replace(/[^a-z0-9가-힣_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120); }
export function kstParts(date=new Date()) { const shifted=new Date(date.getTime()+9*60*60*1000); return {date:shifted.toISOString().slice(0,10),hour:shifted.getUTCHours()}; }
export function campaignKey(runDate,provider,productRowId) { return `mall-${String(runDate).replaceAll('-','')}-${slug(provider)}-${Number(productRowId)}`; }
function parseJsonObject(text) { const source=clean(text,12000); const start=source.indexOf('{'); const end=source.lastIndexOf('}'); if(start<0||end<=start) return null; try { return JSON.parse(source.slice(start,end+1)); } catch { return null; } }

async function schemaReady(env) {
  if (!env.DB?.prepare) return false;
  try {
    const result = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (
      'affiliate_storefront_products','affiliate_storefront_clicks','affiliate_promotion_runs','affiliate_promotion_visits','affiliate_growth_opportunities',
      'marketing_oauth_connections','marketing_publish_channels','marketing_content_items','marketing_publication_jobs','marketing_publish_policies','service_subscriptions'
    )`).all();
    return (result.results || []).length === 11;
  } catch { return false; }
}

async function autonomyGate(env) {
  const [policy,subscription] = await Promise.all([
    env.DB.prepare('SELECT mode,max_daily_posts FROM marketing_publish_policies WHERE subject_type=? AND subject_key=?').bind(SUBJECT_TYPE,SUBJECT_KEY).first(),
    env.DB.prepare("SELECT plan_id,status FROM service_subscriptions WHERE subject_type=? AND subject_key=? AND site='marketing'").bind(SUBJECT_TYPE,SUBJECT_KEY).first(),
  ]);
  const policyReady = policy?.mode === 'autonomous';
  const entitlementReady = subscription?.status === 'active' && ['auto','enterprise'].includes(subscription?.plan_id);
  return {allowed:policyReady&&entitlementReady,policy:policy?.mode||'missing',plan:subscription?.plan_id||'missing',reason:!policyReady?'AUTONOMOUS_POLICY_REQUIRED':!entitlementReady?'MARKETING_AUTO_ENTITLEMENT_REQUIRED':''};
}

async function activeConnections(env) {
  const result = await env.DB.prepare(`SELECT id,provider,resource_type,external_id,display_name,token_ciphertext,status,metadata_json
    FROM marketing_oauth_connections
    WHERE subject_type=? AND subject_key=? AND status='active' AND provider IN ('facebook','instagram','threads')
    ORDER BY CASE provider WHEN 'instagram' THEN 1 WHEN 'facebook' THEN 2 ELSE 3 END,id`)
    .bind(SUBJECT_TYPE,SUBJECT_KEY).all();
  return (result.results||[]).slice(0,MAX_DAILY_CHANNELS).map(row=>({...row,metadata:safeParse(row.metadata_json,{})}));
}

async function candidateProducts(env,limit=8) {
  const result = await env.DB.prepare(`SELECT p.id,p.product_id,p.product_name,p.price_krw,p.category,p.selection_score,p.is_rocket,p.is_free_shipping,
      COALESCE(c.clicks_7d,0) AS clicks_7d,
      COALESCE(o.opportunity_score,0) AS opportunity_score,COALESCE(o.recommended_action,'hold') AS recommended_action,COALESCE(o.campaign_angle,'') AS campaign_angle
    FROM affiliate_storefront_products p
    LEFT JOIN (
      SELECT product_row_id,SUM(clicks) AS clicks_7d FROM affiliate_storefront_clicks
      WHERE click_date >= date('now','-6 day') GROUP BY product_row_id
    ) c ON c.product_row_id=p.id
    LEFT JOIN affiliate_growth_opportunities o ON o.product_row_id=p.id
      AND o.run_date=(SELECT MAX(run_date) FROM affiliate_growth_opportunities)
    WHERE p.account_id=? AND p.storefront_slug=? AND p.status='active'
    ORDER BY CASE COALESCE(o.recommended_action,'hold') WHEN 'scale' THEN 1 WHEN 'test' THEN 2 WHEN 'observe' THEN 3 ELSE 4 END,
      COALESCE(o.opportunity_score,0) DESC,COALESCE(c.clicks_7d,0) DESC,p.selection_score DESC,p.id DESC
    LIMIT ?`).bind(ACCOUNT_ID,STOREFRONT,limit).all();
  return result.results || [];
}

async function recentlyPromotedProductIds(env) {
  const result = await env.DB.prepare(`SELECT DISTINCT product_row_id FROM affiliate_promotion_runs
    WHERE run_date >= date('now','-2 day') AND status IN ('planned','publishing','published')`).all().catch(()=>({results:[]}));
  return new Set((result.results||[]).map(row=>Number(row.product_row_id)));
}

function chooseProduct(products,recent,index) {
  const fresh = products.filter(row=>!recent.has(Number(row.id)));
  const pool = fresh.length ? fresh : products;
  if (!pool.length) return null;
  if (pool[0].recommended_action === 'scale') return pool[0];
  return pool[index % pool.length];
}

export function fallbackContent(product,provider) {
  const name=clean(product?.product_name,90);
  const category=clean(product?.category||'추천',30);
  const angle=clean(product?.campaign_angle||`${category} 실용 비교형 추천`,100);
  const hooks={facebook:`${category}, 지금 살펴볼 이유: ${name}`,instagram:`${category} 구매 전 오늘 확인할 한 가지`,threads:`지금 눈여겨볼 ${category}: ${name}`};
  const bodies={
    facebook:`${angle}\n${name}\n필요한 기능·배송조건·현재 가격을 한 번에 비교해 보세요.`,
    instagram:`${angle}\n${name}\n광고 문구보다 내 상황에 맞는지 비교하는 데 초점을 맞췄습니다.`,
    threads:`${angle}\n${name}\n지금 필요한 사람에게 맞는 선택인지 최신 조건을 확인해 보세요.`,
  };
  return {title:hooks[provider]||hooks.facebook,caption:`${AFFILIATE_DISCLOSURE}\n\n${bodies[provider]||bodies.facebook}\n\n에코디몰에서 자세히 보기`,mode:'rules'};
}

async function aiContent(env,product,provider) {
  const fallback=fallbackContent(product,provider);
  const ai=createOpenAiProvider(env);
  if(!ai.available) return fallback;
  const message=[
    '에코디몰의 능동형 유기적 SNS 영업 콘텐츠를 작성하세요.',
    `채널: ${provider}`,
    `상품명: ${clean(product.product_name,180)}`,
    `카테고리: ${clean(product.category,60)}`,
    `AI 영업기회 점수: ${Number(product.opportunity_score||0)}/100`,
    `권장행동: ${clean(product.recommended_action,30)}`,
    `캠페인 각도: ${clean(product.campaign_angle,140)}`,
    `최근 7일 에코디몰 클릭: ${Number(product.clicks_7d||0)}`,
    '과장, 최저가·효능·품질 보장, 허위 후기, 긴급 구매 압박을 금지합니다.',
    '상품 나열보다 고객의 문제·선택기준·구매판단에 도움이 되는 정보형 문구를 우선합니다.',
    'URL, 해시태그, 제휴고지문은 넣지 마세요.',
    'JSON만 반환하세요: {"title":"80자 이내","caption":"700자 이내"}',
  ].join('\n');
  try {
    const result=await ai.invoke({taskName:'ekodi-mall-active-sales-promotion',context:{message,page:{section:'marketing',title:'EKODI Mall active sales promotion',pathname:'/mall'}}});
    const parsed=parseJsonObject(result.text);
    const title=clean(parsed?.title,120); const caption=clean(parsed?.caption,900);
    if(!title||!caption) return fallback;
    return {title,caption:`${AFFILIATE_DISCLOSURE}\n\n${caption}\n\n에코디몰에서 자세히 보기`,mode:'ai',model:clean(result.model,120)};
  } catch(error) { console.error('EKODI Mall active sales content fallback',String(error?.message||error)); return fallback; }
}

function base64ToBytes(value){ const raw=atob(value); return Uint8Array.from(raw,char=>char.charCodeAt(0)); }
async function encryptionKey(secret){ const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(secret||''))); return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['decrypt']); }
function providerSecret(env,provider){ return provider==='threads'?String(env.THREADS_APP_SECRET||env.META_APP_SECRET||''):String(env.META_APP_SECRET||''); }
async function decryptToken(env,provider,ciphertext){ const secret=providerSecret(env,provider); if(!secret) throw new Error('PLATFORM_SECRET_MISSING'); const [version,iv64,data64]=String(ciphertext||'').split('.'); if(version!=='v1'||!iv64||!data64) throw new Error('CREDENTIAL_FORMAT_INVALID'); const key=await encryptionKey(secret); const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(iv64)},key,base64ToBytes(data64)); return new TextDecoder().decode(plain); }
async function fetchJson(url,init={}){ const response=await fetch(url,init); const data=await response.json().catch(()=>({})); if(!response.ok||data?.error) throw new Error(clean(data?.error?.message||data?.message||`HTTP_${response.status}`,500)); return data; }
function graphBase(env){ return `https://graph.facebook.com/${clean(env.META_GRAPH_VERSION||'v25.0',16)}`; }

async function publishFacebook(env,connection,content){ const token=await decryptToken(env,connection.provider,connection.token_ciphertext); const form=new URLSearchParams({url:content.imageUrl,caption:`${content.caption}\n\n${content.linkUrl}`,published:'true',access_token:token}); const data=await fetchJson(`${graphBase(env)}/${encodeURIComponent(connection.external_id)}/photos`,{method:'POST',body:form}); return {id:String(data.post_id||data.id||''),url:data.post_id?`https://www.facebook.com/${data.post_id}`:'',data}; }
async function publishInstagram(env,connection,content){ const token=await decryptToken(env,connection.provider,connection.token_ciphertext); const create=new URLSearchParams({image_url:content.imageUrl,caption:`${content.caption}\n\n${content.linkUrl}`,access_token:token}); const container=await fetchJson(`${graphBase(env)}/${encodeURIComponent(connection.external_id)}/media`,{method:'POST',body:create}); if(!container.id) throw new Error('INSTAGRAM_CONTAINER_FAILED'); const publish=new URLSearchParams({creation_id:String(container.id),access_token:token}); const data=await fetchJson(`${graphBase(env)}/${encodeURIComponent(connection.external_id)}/media_publish`,{method:'POST',body:publish}); let permalink=''; if(data.id){ const detail=new URL(`${graphBase(env)}/${data.id}`); detail.searchParams.set('fields','permalink'); detail.searchParams.set('access_token',token); const info=await fetchJson(detail.href).catch(()=>({})); permalink=safeUrl(info.permalink); } return {id:String(data.id||''),url:permalink,data}; }
async function publishThreads(env,connection,content){ const token=await decryptToken(env,connection.provider,connection.token_ciphertext); const form=new URLSearchParams({media_type:'IMAGE',image_url:content.imageUrl,text:`${clean(content.caption,420)}\n\n${content.linkUrl}`,access_token:token}); const container=await fetchJson(`https://graph.threads.net/v1.0/${encodeURIComponent(connection.external_id)}/threads`,{method:'POST',body:form}); if(!container.id) throw new Error('THREADS_CONTAINER_FAILED'); const publish=new URLSearchParams({creation_id:String(container.id),access_token:token}); const data=await fetchJson(`https://graph.threads.net/v1.0/${encodeURIComponent(connection.external_id)}/threads_publish`,{method:'POST',body:publish}); let permalink=''; if(data.id){ const detail=new URL(`https://graph.threads.net/v1.0/${data.id}`); detail.searchParams.set('fields','permalink'); detail.searchParams.set('access_token',token); const info=await fetchJson(detail.href).catch(()=>({})); permalink=safeUrl(info.permalink); } return {id:String(data.id||''),url:permalink,data}; }
async function executeProvider(env,connection,content){ if(connection.provider==='facebook') return publishFacebook(env,connection,content); if(connection.provider==='instagram') return publishInstagram(env,connection,content); if(connection.provider==='threads') return publishThreads(env,connection,content); throw new Error('PROVIDER_NOT_SUPPORTED'); }

async function ensurePublishChannel(env,connection){ const channelType=connection.provider==='facebook'?'page':connection.provider==='instagram'?'business':'profile'; const now=nowIso(); await env.DB.prepare(`INSERT INTO marketing_publish_channels(subject_type,subject_key,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json,last_check_at,last_error,created_at,updated_at)
  VALUES(?,?,?,?,?,?,'','active',?,?,'',?,?)
  ON CONFLICT(subject_type,subject_key,provider,channel_type,external_account_id) DO UPDATE SET display_name=excluded.display_name,status='active',config_json=excluded.config_json,last_check_at=excluded.last_check_at,last_error='',updated_at=excluded.updated_at`)
  .bind(SUBJECT_TYPE,SUBJECT_KEY,connection.provider,channelType,clean(connection.display_name,120),clean(connection.external_id,160),safeJson({credentialMode:'oauth-vault',oauthConnectionId:Number(connection.id)}),now,now,now).run(); const row=await env.DB.prepare('SELECT id FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? AND provider=? AND channel_type=? AND external_account_id=?').bind(SUBJECT_TYPE,SUBJECT_KEY,connection.provider,channelType,connection.external_id).first(); return Number(row?.id||0); }

async function insertMarketingLedger(env,connection,content,publishResult){ const channelId=await ensurePublishChannel(env,connection); if(!channelId) return; const now=nowIso(); const item=await env.DB.prepare(`INSERT INTO marketing_content_items(subject_type,subject_key,title,content_type,caption,asset_url,link_url,content_json,source,approval_state,created_by,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?, 'ai','auto_approved','promotion-ai',?,?)`).bind(SUBJECT_TYPE,SUBJECT_KEY,clean(content.title,240),'social_post',clean(content.caption,12000),content.imageUrl,content.linkUrl,safeJson({campaignKey:content.campaignKey,storefront:STOREFRONT,productRowId:content.productRowId,opportunityScore:content.opportunityScore,recommendedAction:content.recommendedAction,campaignAngle:content.campaignAngle}),now,now).run(); const contentId=Number(item.meta?.last_row_id||0); if(!contentId) return; await env.DB.prepare(`INSERT INTO marketing_publication_jobs(subject_type,subject_key,content_id,channel_id,schedule_kind,scheduled_at,recurrence_rule,status,requested_by,attempt_count,max_attempts,external_post_id,external_post_url,provider_response_json,last_error,published_at,created_at,updated_at)
  VALUES(?,?,?,?,'immediate',?,'','published','ai',1,1,?,?,?,'',?,?,?)`).bind(SUBJECT_TYPE,SUBJECT_KEY,contentId,channelId,now,clean(publishResult.id,240),safeUrl(publishResult.url),safeJson({ok:true,provider:connection.provider}),now,now,now).run(); }

async function upsertRun(env,values){ const now=nowIso(); await env.DB.prepare(`INSERT INTO affiliate_promotion_runs(run_date,product_row_id,product_id,provider,connection_id,campaign_key,status,ai_mode,ai_model,content_json,external_post_id,external_post_url,last_error,published_at,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(run_date,product_row_id,provider,connection_id) DO UPDATE SET campaign_key=excluded.campaign_key,status=excluded.status,ai_mode=excluded.ai_mode,ai_model=excluded.ai_model,content_json=excluded.content_json,external_post_id=excluded.external_post_id,external_post_url=excluded.external_post_url,last_error=excluded.last_error,published_at=excluded.published_at,updated_at=excluded.updated_at`)
  .bind(values.runDate,Number(values.productRowId),clean(values.productId,100),clean(values.provider,30),Number(values.connectionId),clean(values.campaignKey,160),clean(values.status,40),clean(values.aiMode,30),clean(values.aiModel,120),safeJson(values.content||{}),clean(values.externalPostId,240),safeUrl(values.externalPostUrl),clean(values.lastError,1000),values.publishedAt||null,now,now).run(); }

export async function getMallPromotionStatus(env){ if(!(await schemaReady(env))) return {enabled:true,schemaReady:false,status:'schema_required'}; const [gate,connections,latest,today]=await Promise.all([autonomyGate(env),activeConnections(env),env.DB.prepare('SELECT run_date,status,provider,published_at,last_error,updated_at,content_json FROM affiliate_promotion_runs ORDER BY id DESC LIMIT 1').first().catch(()=>null),env.DB.prepare("SELECT COUNT(*) AS planned,SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed FROM affiliate_promotion_runs WHERE run_date=?").bind(kstParts().date).first().catch(()=>null)]); const latestContent=safeParse(latest?.content_json,{}); return {enabled:true,schemaReady:true,scheduler:true,organicOnly:true,paidActivation:false,strategy:'opportunity_first',subject:`${SUBJECT_TYPE}:${SUBJECT_KEY}`,channels:connections.map(row=>row.provider),gate,today:{planned:Number(today?.planned||0),published:Number(today?.published||0),failed:Number(today?.failed||0)},lastRun:latest?{date:latest.run_date,status:latest.status,provider:latest.provider,publishedAt:latest.published_at||null,error:latest.last_error||'',opportunityScore:Number(latestContent.opportunityScore||0),recommendedAction:latestContent.recommendedAction||'',updatedAt:latest.updated_at}:null}; }

export async function runMallPromotionAutomation(env,{reason='cron',force=false}={}){
  if(!(await schemaReady(env))) return {ok:false,status:'schema_required'};
  const kst=kstParts(); if(!force&&kst.hour<RUN_AFTER_KST_HOUR) return {ok:true,status:'not_due',runDate:kst.date};
  const gate=await autonomyGate(env); const connections=await activeConnections(env);
  if(!connections.length) return {ok:true,status:'connection_required',runDate:kst.date,gate};
  const products=await candidateProducts(env,8); if(!products.length) return {ok:true,status:'no_products',runDate:kst.date};
  if(!gate.allowed){ for(const connection of connections){ const product=products[0]; await upsertRun(env,{runDate:kst.date,productRowId:product.id,productId:product.product_id,provider:connection.provider,connectionId:connection.id,campaignKey:campaignKey(kst.date,connection.provider,product.id),status:'approval_required',aiMode:'rules',content:{reason,opportunityScore:Number(product.opportunity_score||0),recommendedAction:product.recommended_action,campaignAngle:product.campaign_angle},lastError:gate.reason}); } return {ok:true,status:'approval_required',runDate:kst.date,gate}; }
  const existing=await env.DB.prepare('SELECT provider,connection_id,status FROM affiliate_promotion_runs WHERE run_date=?').bind(kst.date).all();
  const completed=new Set((existing.results||[]).filter(row=>['published','publishing','planned'].includes(row.status)).map(row=>`${row.provider}:${row.connection_id}`));
  const recent=await recentlyPromotedProductIds(env); const results=[];
  for(let index=0;index<connections.length;index+=1){ const connection=connections[index]; const connectionKey=`${connection.provider}:${connection.id}`; if(completed.has(connectionKey)) continue; const product=chooseProduct(products,recent,index); if(!product) continue; const keyValue=campaignKey(kst.date,connection.provider,product.id); const linkUrl=`https://marketing-connect-api.ekodi.kr/r/mall/${encodeURIComponent(keyValue)}`; const imageUrl=`https://api.ekodi.kr/api/affiliate/public/image/${Number(product.id)}?storefront=${STOREFRONT}`; const generated=await aiContent(env,product,connection.provider); const content={title:generated.title,caption:generated.caption,imageUrl,linkUrl,campaignKey:keyValue,productRowId:Number(product.id),productId:clean(product.product_id,100),opportunityScore:Number(product.opportunity_score||0),recommendedAction:clean(product.recommended_action,30),campaignAngle:clean(product.campaign_angle,160)}; await upsertRun(env,{runDate:kst.date,productRowId:product.id,productId:product.product_id,provider:connection.provider,connectionId:connection.id,campaignKey:keyValue,status:'publishing',aiMode:generated.mode,aiModel:generated.model||'',content}); try { const published=await executeProvider(env,connection,content); const publishedAt=nowIso(); await upsertRun(env,{runDate:kst.date,productRowId:product.id,productId:product.product_id,provider:connection.provider,connectionId:connection.id,campaignKey:keyValue,status:'published',aiMode:generated.mode,aiModel:generated.model||'',content,externalPostId:published.id,externalPostUrl:published.url,publishedAt}); await insertMarketingLedger(env,connection,content,published).catch(error=>console.error('EKODI Mall marketing ledger write failed after publication',String(error?.message||error))); results.push({provider:connection.provider,status:'published',campaignKey:keyValue,productRowId:Number(product.id),opportunityScore:Number(product.opportunity_score||0),recommendedAction:product.recommended_action,externalPostUrl:safeUrl(published.url)}); if(product.recommended_action!=='scale') recent.add(Number(product.id)); } catch(error){ const message=clean(error?.message||error,1000); await upsertRun(env,{runDate:kst.date,productRowId:product.id,productId:product.product_id,provider:connection.provider,connectionId:connection.id,campaignKey:keyValue,status:'failed',aiMode:generated.mode,aiModel:generated.model||'',content,lastError:message}); results.push({provider:connection.provider,status:'failed',campaignKey:keyValue,error:message}); } }
  return {ok:true,status:results.some(row=>row.status==='published')?'ran':results.length?'failed':'already_done',runDate:kst.date,reason,strategy:'opportunity_first',results};
}

export async function handleMallPromotionRequest(request,env){ const url=new URL(request.url); const match=url.pathname.match(/^\/r\/mall\/([a-z0-9가-힣_-]{8,160})$/i); if(!match||request.method!=='GET') return null; if(!(await schemaReady(env))) return new Response('Not ready',{status:503}); const key=clean(decodeURIComponent(match[1]),160); const row=await env.DB.prepare('SELECT campaign_key,provider,product_id,status FROM affiliate_promotion_runs WHERE campaign_key=? ORDER BY id DESC LIMIT 1').bind(key).first(); if(!row||!['published','publishing','planned'].includes(row.status)) return new Response('Not found',{status:404}); const today=kstParts().date; await env.DB.prepare(`INSERT INTO affiliate_promotion_visits(campaign_key,visit_date,visits,updated_at) VALUES(?,?,1,?) ON CONFLICT(campaign_key,visit_date) DO UPDATE SET visits=affiliate_promotion_visits.visits+1,updated_at=excluded.updated_at`).bind(key,today,nowIso()).run().catch(()=>{}); const target=new URL('https://ekodi.kr/mall'); target.searchParams.set('utm_source',clean(row.provider,30)); target.searchParams.set('utm_medium','organic_social'); target.searchParams.set('utm_campaign',key); if(row.product_id) target.searchParams.set('product',clean(row.product_id,100)); return new Response(null,{status:302,headers:{location:target.href,'cache-control':'no-store','x-content-type-options':'nosniff'}}); }

export const MALL_PROMOTION_DEFAULTS=Object.freeze({subjectType:SUBJECT_TYPE,subjectKey:SUBJECT_KEY,storefront:STOREFRONT,accountId:ACCOUNT_ID,providers:PROVIDERS,runAfterKstHour:RUN_AFTER_KST_HOUR,maxDailyChannels:MAX_DAILY_CHANNELS,disclosure:AFFILIATE_DISCLOSURE,strategy:'opportunity_first'});
