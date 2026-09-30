import { authorizeVerificationOperations } from './verification.js';
import { amazonCredentialVaultReady, decryptAmazonCredential } from './amazon-credential-vault.js';
import { readAmazonListings, readAmazonInventory, readAmazonOrders } from './amazon-sp-api-readonly.js';

const clean=(v,m=500)=>String(v??'').trim().slice(0,m);
const nowIso=()=>new Date().toISOString();
const SCOPE='ekodimall';
const runId=()=>`ars_${crypto.randomUUID().replaceAll('-','')}`;

export async function amazonReadSyncSchemaReady(env){
  if(!env?.DB)return false;
  try{
    const r=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('amazon_sync_runs','amazon_listing_cache','amazon_inventory_cache','amazon_order_cache')").all();
    return new Set((r.results||[]).map(x=>x.name)).size===4;
  }catch{return false;}
}

async function connection(env){
  if(!env?.DB||!amazonCredentialVaultReady(env))return null;
  const row=await env.DB.prepare(`SELECT seller_id AS sellerId,marketplace_id AS marketplaceId,endpoint,
    credential_ciphertext,credential_iv,status FROM amazon_connections WHERE scope=?`).bind(SCOPE).first();
  if(!row||row.status==='disabled')return null;
  const secret=await decryptAmazonCredential(env,row);
  return {
    clientId:clean(secret.clientId,500),clientSecret:clean(secret.clientSecret,1000),refreshToken:clean(secret.refreshToken,2400),
    sellerId:clean(row.sellerId,120),marketplaceId:clean(row.marketplaceId,120),
    endpoint:clean(row.endpoint,300)||'https://sellingpartnerapi-fe.amazon.com'
  };
}

async function persist(env,marketplaceId,data){
  const now=nowIso();
  for(const x of data.listings||[]) await env.DB.prepare(`INSERT INTO amazon_listing_cache
    (scope,marketplace_id,seller_sku,asin,title,status,quantity,updated_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(scope,marketplace_id,seller_sku) DO UPDATE SET asin=excluded.asin,title=excluded.title,status=excluded.status,quantity=excluded.quantity,updated_at=excluded.updated_at`)
    .bind(SCOPE,marketplaceId,x.sellerSku,x.asin,x.title,x.status,x.quantity,now).run();
  for(const x of data.inventory||[]) await env.DB.prepare(`INSERT INTO amazon_inventory_cache
    (scope,marketplace_id,seller_sku,asin,fn_sku,condition,fulfillable_quantity,inbound_quantity,reserved_quantity,unfulfillable_quantity,researching_quantity,total_quantity,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(scope,marketplace_id,seller_sku) DO UPDATE SET asin=excluded.asin,fn_sku=excluded.fn_sku,condition=excluded.condition,
    fulfillable_quantity=excluded.fulfillable_quantity,inbound_quantity=excluded.inbound_quantity,reserved_quantity=excluded.reserved_quantity,
    unfulfillable_quantity=excluded.unfulfillable_quantity,researching_quantity=excluded.researching_quantity,total_quantity=excluded.total_quantity,updated_at=excluded.updated_at`)
    .bind(SCOPE,marketplaceId,x.sellerSku,x.asin,x.fnSku,x.condition,x.fulfillableQuantity,x.inboundQuantity,x.reservedQuantity,x.unfulfillableQuantity,x.researchingQuantity,x.totalQuantity,now).run();
  for(const x of data.orders||[]) await env.DB.prepare(`INSERT INTO amazon_order_cache
    (scope,marketplace_id,amazon_order_id,status,purchase_date,last_updated_date,fulfillment_channel,currency_code,order_total,item_count,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(scope,marketplace_id,amazon_order_id) DO UPDATE SET status=excluded.status,purchase_date=excluded.purchase_date,last_updated_date=excluded.last_updated_date,
    fulfillment_channel=excluded.fulfillment_channel,currency_code=excluded.currency_code,order_total=excluded.order_total,item_count=excluded.item_count,updated_at=excluded.updated_at`)
    .bind(SCOPE,marketplaceId,x.amazonOrderId,x.status,x.purchaseDate,x.lastUpdatedDate,x.fulfillmentChannel,x.currencyCode,x.orderTotal,x.itemCount,now).run();
}

async function snapshot(env,marketplaceId){
  const [l,i,o,r]=await Promise.all([
    env.DB.prepare('SELECT seller_sku AS sellerSku,asin,title,status,quantity,updated_at AS updatedAt FROM amazon_listing_cache WHERE scope=? AND marketplace_id=? ORDER BY updated_at DESC LIMIT 100').bind(SCOPE,marketplaceId).all(),
    env.DB.prepare('SELECT seller_sku AS sellerSku,asin,fn_sku AS fnSku,condition,fulfillable_quantity AS fulfillableQuantity,inbound_quantity AS inboundQuantity,reserved_quantity AS reservedQuantity,unfulfillable_quantity AS unfulfillableQuantity,researching_quantity AS researchingQuantity,total_quantity AS totalQuantity,updated_at AS updatedAt FROM amazon_inventory_cache WHERE scope=? AND marketplace_id=? ORDER BY updated_at DESC LIMIT 100').bind(SCOPE,marketplaceId).all(),
    env.DB.prepare('SELECT amazon_order_id AS amazonOrderId,status,purchase_date AS purchaseDate,last_updated_date AS lastUpdatedDate,fulfillment_channel AS fulfillmentChannel,currency_code AS currencyCode,order_total AS orderTotal,item_count AS itemCount,updated_at AS updatedAt FROM amazon_order_cache WHERE scope=? AND marketplace_id=? ORDER BY COALESCE(last_updated_date,updated_at) DESC LIMIT 100').bind(SCOPE,marketplaceId).all(),
    env.DB.prepare('SELECT id,status,marketplace_id AS marketplaceId,resources_json AS resourcesJson,listings_count AS listingsCount,inventory_count AS inventoryCount,orders_count AS ordersCount,errors_json AS errorsJson,started_by AS startedBy,started_at AS startedAt,completed_at AS completedAt FROM amazon_sync_runs WHERE scope=? ORDER BY started_at DESC LIMIT 10').bind(SCOPE).all()
  ]);
  const parse=v=>{try{return JSON.parse(v||'[]')}catch{return[]}};
  return {marketplaceId,listings:l.results||[],inventory:i.results||[],orders:o.results||[],runs:(r.results||[]).map(x=>({...x,resources:parse(x.resourcesJson),errors:parse(x.errorsJson),resourcesJson:undefined,errorsJson:undefined}))};
}

async function sync(request,env,actor){
  const cred=await connection(env);
  if(!cred)return {status:409,body:{error:'AMAZON_SETUP_REQUIRED'}};
  const body=await request.json().catch(()=>({}));
  const marketplaceId=clean(body.marketplaceId||cred.marketplaceId,120);
  if(!marketplaceId)return {status:400,body:{error:'AMAZON_MARKETPLACE_ID_REQUIRED'}};
  const allowed=new Set(['listings','inventory','orders']);
  const resources=(Array.isArray(body.resources)?body.resources:['listings','inventory','orders']).map(x=>clean(x,40)).filter(x=>allowed.has(x));
  if(!resources.length)return {status:400,body:{error:'AMAZON_READ_RESOURCES_REQUIRED'}};
  const id=runId(),started=nowIso(),errors=[],data={listings:[],inventory:[],orders:[]};
  await env.DB.prepare(`INSERT INTO amazon_sync_runs (id,scope,mode,marketplace_id,resources_json,status,started_by,started_at)
    VALUES (?,?,'read-only',?,?,'running',?,?)`).bind(id,SCOPE,marketplaceId,JSON.stringify(resources),clean(actor,160),started).run();
  for(const resource of resources){
    try{
      if(resource==='listings')data.listings=await readAmazonListings(cred,{marketplaceId});
      if(resource==='inventory')data.inventory=await readAmazonInventory(cred,{marketplaceId});
      if(resource==='orders')data.orders=await readAmazonOrders(cred,{marketplaceId,lastUpdatedAfter:clean(body.lastUpdatedAfter,80)||undefined});
    }catch(e){errors.push({resource,code:clean(e?.code||e?.message||'AMAZON_READ_FAILED',180),status:Number(e?.status||0)||null});}
  }
  await persist(env,marketplaceId,data);
  const status=errors.length===0?'completed':errors.length===resources.length?'failed':'partial';
  await env.DB.prepare('UPDATE amazon_sync_runs SET status=?,listings_count=?,inventory_count=?,orders_count=?,errors_json=?,completed_at=? WHERE id=?')
    .bind(status,data.listings.length,data.inventory.length,data.orders.length,JSON.stringify(errors),nowIso(),id).run();
  return {status:status==='failed'?502:200,body:{ok:status!=='failed',mode:'read-only',mutationEnabled:false,runId:id,status,marketplaceId,counts:{listings:data.listings.length,inventory:data.inventory.length,orders:data.orders.length},errors,snapshot:await snapshot(env,marketplaceId)}};
}

export async function handleAmazonReadonlyRequest(request,env={}){
  const url=new URL(request.url);
  if(!['/api/amazon/sync/read-only','/api/amazon/read-model'].includes(url.pathname))return null;
  if(!env.DB||!(await amazonReadSyncSchemaReady(env)))return {status:503,body:{error:'AMAZON_READ_SYNC_SCHEMA_NOT_READY'}};
  const auth=await authorizeVerificationOperations(request,env);
  if(!auth.ok)return {status:auth.status,body:{error:auth.error}};
  if(request.method==='POST'&&url.pathname==='/api/amazon/sync/read-only')return sync(request,env,auth.actor);
  if(request.method==='GET'&&url.pathname==='/api/amazon/read-model'){
    const cred=await connection(env);
    const marketplaceId=clean(url.searchParams.get('marketplaceId')||cred?.marketplaceId,120);
    if(!marketplaceId)return {status:400,body:{error:'AMAZON_MARKETPLACE_ID_REQUIRED'}};
    return {status:200,body:{mode:'read-only',mutationEnabled:false,...await snapshot(env,marketplaceId)}};
  }
  return {status:405,body:{error:'METHOD_NOT_ALLOWED'}};
}
