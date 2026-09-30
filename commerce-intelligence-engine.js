export const COMMERCE_PROVIDER_ORDER=Object.freeze([
  'baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn_order','naver_order',
]);

export const COMMERCE_PROVIDERS=Object.freeze({
  baemin:{label:'배달의민족'},
  coupang_eats:{label:'쿠팡이츠'},
  yogiyo:{label:'요기요'},
  ddangyo:{label:'땡겨요'},
  mukkebi:{label:'먹깨비'},
  daangn_order:{label:'당근주문'},
  naver_order:{label:'네이버주문'},
});

export const COMMERCE_CONNECTION_PRIORITY=Object.freeze([
  'official_api',
  'merchant_connection',
  'partner_import',
  'public_discovery',
  'manual_verified',
]);

export const COMMERCE_CAPABILITIES=Object.freeze([
  'store_read','store_write','menu_read','menu_write','orders_read','sales_read','reviews_read','review_reply',
]);

const READ_ONLY_DISCOVERY=Object.freeze({
  store_read:true,store_write:false,menu_read:true,menu_write:false,
  orders_read:false,sales_read:false,reviews_read:false,review_reply:false,
});
const FULL_MERCHANT=Object.freeze(Object.fromEntries(COMMERCE_CAPABILITIES.map(key=>[key,true])));
const PARTNER_READ=Object.freeze({
  store_read:true,store_write:false,menu_read:true,menu_write:false,
  orders_read:true,sales_read:true,reviews_read:true,review_reply:false,
});

export function normalizeCommerceProvider(value){
  const provider=String(value||'').trim().toLowerCase();
  return COMMERCE_PROVIDER_ORDER.includes(provider)?provider:'';
}

export function providerLabel(provider){
  const key=normalizeCommerceProvider(provider);
  return key?COMMERCE_PROVIDERS[key].label:String(provider||'');
}

export function defaultCommerceCapabilities(connectionMode){
  const mode=String(connectionMode||'none').trim().toLowerCase();
  if(mode==='official_api'||mode==='merchant_connection')return {...FULL_MERCHANT};
  if(mode==='partner_import')return {...PARTNER_READ};
  if(mode==='public_discovery'||mode==='manual_verified')return {...READ_ONLY_DISCOVERY};
  return Object.fromEntries(COMMERCE_CAPABILITIES.map(key=>[key,false]));
}

export function effectiveCommerceCapabilities(connection={}){
  const baseline=defaultCommerceCapabilities(connection.connection_mode||connection.connectionMode);
  const declared=connection.capabilities&&typeof connection.capabilities==='object'?connection.capabilities:{};
  return Object.fromEntries(COMMERCE_CAPABILITIES.map(key=>[key,Boolean(baseline[key]&&declared[key]!==false||declared[key]===true&&baseline[key])]));
}

export function canExecuteCommerceAction(connection,actionKind){
  const capabilities=effectiveCommerceCapabilities(connection);
  const required={
    store_update:'store_write',menu_update:'menu_write',sync_orders:'orders_read',
    sync_sales:'sales_read',sync_reviews:'reviews_read',review_reply:'review_reply',
  }[String(actionKind||'')];
  return Boolean(required&&capabilities[required]);
}

export function commerceDiscoveryPlan({provider,connectionMode='none'}={}){
  const key=normalizeCommerceProvider(provider);
  if(!key)return {provider:'',steps:[],writable:false};
  const requested=String(connectionMode||'none');
  const start=Math.max(0,COMMERCE_CONNECTION_PRIORITY.indexOf(requested));
  const steps=COMMERCE_CONNECTION_PRIORITY.slice(start).map(mode=>({mode,capabilities:defaultCommerceCapabilities(mode)}));
  return {provider:key,label:providerLabel(key),steps,writable:steps.some(step=>step.capabilities.store_write||step.capabilities.menu_write||step.capabilities.review_reply)};
}

const FORBIDDEN_KEYS=/(token|secret|password|authorization|cookie|phone|address|customer|review_text|reply_text|name|email)/i;
export function sanitizeCommerceLearningSignal(signal={}){
  const out={};
  for(const [key,value] of Object.entries(signal&&typeof signal==='object'?signal:{})){
    if(FORBIDDEN_KEYS.test(key))continue;
    if(value==null||['string','number','boolean'].includes(typeof value))out[key]=value;
    else if(Array.isArray(value))out[key]=value.slice(0,50).map(item=>typeof item==='object'?'[structured]':item);
  }
  return out;
}

export function buildCommerceLearningEvent({storeId,provider,eventType,targetKind='store',signal={},confidence=0,outcome='observed',sourceRefHash=''}={}){
  const key=normalizeCommerceProvider(provider);
  if(!storeId||!key||!eventType)throw new Error('invalid_commerce_learning_event');
  const safeConfidence=Math.max(0,Math.min(1,Number(confidence)||0));
  return {
    store_id:String(storeId),provider:key,event_type:String(eventType),target_kind:String(targetKind),
    signal:sanitizeCommerceLearningSignal(signal),confidence:safeConfidence,outcome:String(outcome),
    source_ref_hash:String(sourceRefHash||''),
  };
}

export const COMMERCE_GEN10_POLICY=Object.freeze({
  version:'10.0',
  sourcePriority:COMMERCE_CONNECTION_PRIORITY,
  tenantIsolation:'store_id',
  secretsInBrowser:false,
  publicDiscoveryWritable:false,
  humanApproval:['review_reply','menu_update','store_update','order_action'],
  learning:'outcome-metadata-only-no-customer-pii',
});
