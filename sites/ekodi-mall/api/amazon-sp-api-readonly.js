const clean=(value,max=500)=>String(value??'').trim().slice(0,max);

function apiError(body,status){
  const e=body?.errors?.[0]||{};
  return { code:clean(e.code||e.message||`spapi_${status}`,180), status };
}

export async function amazonLwaAccessToken(credential){
  const form=new URLSearchParams({
    grant_type:'refresh_token',
    refresh_token:credential.refreshToken,
    client_id:credential.clientId,
    client_secret:credential.clientSecret
  });
  const response=await fetch('https://api.amazon.com/auth/o2/token',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','accept':'application/json'},
    body:form.toString()
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.access_token){
    const error=clean(body.error||body.error_description||`lwa_${response.status}`,180);
    throw Object.assign(new Error('AMAZON_LWA_AUTH_FAILED'),{code:error,status:response.status});
  }
  return String(body.access_token);
}

export async function amazonSpApiGet(credential,path,params={}){
  const token=await amazonLwaAccessToken(credential);
  const endpoint=String(credential.endpoint||'https://sellingpartnerapi-fe.amazon.com').replace(/\/+$/,'');
  const url=new URL(endpoint+path);
  for(const [key,value] of Object.entries(params)){
    if(value===undefined||value===null||value==='')continue;
    url.searchParams.set(key,Array.isArray(value)?value.join(','):String(value));
  }
  const response=await fetch(url,{
    method:'GET',
    headers:{
      accept:'application/json',
      'x-amz-access-token':token,
      'x-amz-date':new Date().toISOString().replace(/[-:]|\.\d{3}/g,''),
      'user-agent':'EKODI-Mall/1.0 (Language=JavaScript)'
    }
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok){
    const meta=apiError(body,response.status);
    throw Object.assign(new Error('AMAZON_SP_API_READ_FAILED'),meta);
  }
  return body;
}

const arrayFrom=(value,...keys)=>{
  if(Array.isArray(value))return value;
  for(const key of keys){
    if(Array.isArray(value?.[key]))return value[key];
    if(Array.isArray(value?.payload?.[key]))return value.payload[key];
  }
  return [];
};

export async function readAmazonListings(credential,{marketplaceId}){
  if(!credential.sellerId)throw Object.assign(new Error('AMAZON_SELLER_ID_REQUIRED'),{code:'AMAZON_SELLER_ID_REQUIRED'});
  const body=await amazonSpApiGet(
    credential,
    `/listings/2021-08-01/items/${encodeURIComponent(credential.sellerId)}`,
    {marketplaceIds:marketplaceId,includedData:'summaries,offers,fulfillmentAvailability'}
  );
  return arrayFrom(body,'items','listings').map(item=>{
    const summary=Array.isArray(item.summaries)?item.summaries[0]||{}:item.summary||{};
    const fulfillment=Array.isArray(item.fulfillmentAvailability)?item.fulfillmentAvailability[0]||{}:{};
    return {
      sellerSku:clean(item.sku||item.sellerSku,240),
      asin:clean(summary.asin||item.asin,40),
      title:clean(summary.itemName||summary.title||item.title,500),
      status:clean(summary.status||item.status,80),
      quantity:Number(fulfillment.quantity??fulfillment.quantityAvailable??item.quantity??0)||0
    };
  }).filter(x=>x.sellerSku);
}

export async function readAmazonInventory(credential,{marketplaceId}){
  const body=await amazonSpApiGet(
    credential,
    '/fba/inventory/v1/summaries',
    {granularityType:'Marketplace',granularityId:marketplaceId,marketplaceIds:marketplaceId,details:'true'}
  );
  return arrayFrom(body,'inventorySummaries','summaries').map(item=>{
    const d=item.inventoryDetails||{};
    const inbound=(Number(d.inboundWorkingQuantity)||0)+(Number(d.inboundShippedQuantity)||0)+(Number(d.inboundReceivingQuantity)||0);
    const researching=Array.isArray(d.researchingQuantity?.researchingQuantityBreakdown)
      ? d.researchingQuantity.researchingQuantityBreakdown.reduce((sum,row)=>sum+(Number(row.quantity)||0),0)
      : Number(d.researchingQuantity?.totalResearchingQuantity||0)||0;
    return {
      sellerSku:clean(item.sellerSku,240),
      asin:clean(item.asin,40),
      fnSku:clean(item.fnSku,120),
      condition:clean(item.condition,80),
      fulfillableQuantity:Number(d.fulfillableQuantity||0)||0,
      inboundQuantity:inbound,
      reservedQuantity:Number(d.reservedQuantity?.totalReservedQuantity||0)||0,
      unfulfillableQuantity:Number(d.unfulfillableQuantity?.totalUnfulfillableQuantity||0)||0,
      researchingQuantity:researching,
      totalQuantity:Number(item.totalQuantity||0)||0
    };
  }).filter(x=>x.sellerSku);
}

export async function readAmazonOrders(credential,{marketplaceId,lastUpdatedAfter}){
  const since=lastUpdatedAfter||new Date(Date.now()-7*86400000).toISOString();
  const body=await amazonSpApiGet(
    credential,
    '/orders/2026-01-01/orders',
    {marketplaceIds:marketplaceId,lastUpdatedAfter:since,maxResultsPerPage:20}
  );
  return arrayFrom(body,'orders').map(order=>{
    const total=order.orderTotal||order.total||{};
    const items=Array.isArray(order.orderItems)?order.orderItems:[];
    return {
      amazonOrderId:clean(order.amazonOrderId||order.orderId,120),
      status:clean(order.orderStatus||order.status,100),
      purchaseDate:clean(order.purchaseDate||order.createdAt,80)||null,
      lastUpdatedDate:clean(order.lastUpdateDate||order.lastUpdatedAt||order.updatedAt,80)||null,
      fulfillmentChannel:clean(order.fulfillmentChannel||order.fulfilledBy,100),
      currencyCode:clean(total.currencyCode||total.currency,20),
      orderTotal:Number(total.amount??total.value??0)||0,
      itemCount:Number(order.numberOfItemsShipped??order.numberOfItemsUnshipped??items.length??0)||items.length
    };
  }).filter(x=>x.amazonOrderId);
}
