// EKODI canonical store order model.
//
// Provider rows (store_platform_orders, store_sms_orders, future official
// adapters) stay untouched in their own ledgers. This module only projects them
// into one read-only canonical shape and keeps a pointer back to the provider
// row in `raw_reference`. It never copies raw provider payloads and never
// mutates its input.
//
// The factory is intentionally self-contained (no outer references) because
// the Store Admin client receives it as `createStoreOrderModel.toString()`.
export function createStoreOrderModel(){
  const KST_OFFSET_MS=9*60*60*1000;
  const PROVIDER_LABELS=Object.freeze({
    ddangyo:'땡겨요',baemin:'배달의민족',yogiyo:'요기요',mukkebi:'먹깨비',coupang_eats:'쿠팡이츠',
    daangn:'당근 주문',naver_order:'네이버 주문',store:'EKODI 매장',sms:'문자 주문',vpos:'POS',
    smartcon:'스마트콘',takeout:'포장주문',reservation:'예약',delivery:'배달주문'
  });
  // Canonical lifecycle shared by every provider.
  const CANONICAL_STATUSES=Object.freeze(['new','pending_customer','in_progress','in_delivery','completed','cancelled','unknown']);
  const PLATFORM_STATUS=Object.freeze({
    received:'new',accepted:'in_progress',preparing:'in_progress',ready:'in_progress',
    picked_up:'in_delivery',delivering:'in_delivery',completed:'completed',
    cancelled:'cancelled',rejected:'cancelled',unknown:'unknown'
  });
  const SMS_STATUS=Object.freeze({
    awaiting_customer_confirmation:'pending_customer',customer_confirmed:'new',store_accepted:'in_progress',
    completed:'completed',cancelled:'cancelled',rejected:'cancelled'
  });
  const ORDER_TYPES=Object.freeze(['delivery','takeout','dine_in','reservation','unknown']);
  const ACTIVE_CONNECTOR=new Set(['active','ready']);
  const BROKEN_CONNECTOR=new Set(['error','failed','expired','revoked','needs_reauth','reauth_required','disconnected']);

  const text=(value,max=200)=>String(value==null?'':value).trim().slice(0,max);
  const money=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n):null};
  const iso=value=>{if(!value)return null;const t=Date.parse(value);return Number.isFinite(t)?new Date(t).toISOString():null};
  const providerLabel=provider=>PROVIDER_LABELS[String(provider||'')]||text(provider,40)||'알 수 없음';
  const orderType=value=>{
    const v=text(value,40).toLowerCase();
    if(['delivery','배달'].includes(v))return'delivery';
    if(['takeout','pickup','take_out','포장'].includes(v))return'takeout';
    if(['dine_in','table','매장','dinein'].includes(v))return'dine_in';
    if(['reservation','booking','예약'].includes(v))return'reservation';
    return'unknown';
  };
  const items=value=>{
    const rows=Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):value?[value]:[];
    return rows.slice(0,50).map(row=>{
      if(typeof row==='string')return{name:text(row,120),quantity:null,options:[]};
      const options=Array.isArray(row?.options)?row.options.slice(0,20).map(o=>typeof o==='string'?text(o,80):text(o?.name||o?.label,80)).filter(Boolean):[];
      const qty=Number(row?.quantity??row?.qty);
      return{name:text(row?.name||row?.title||row?.menu,120),quantity:Number.isFinite(qty)&&qty>0?qty:null,options};
    }).filter(row=>row.name);
  };
  // KST calendar day (Asia/Seoul has no DST).
  const kstDay=value=>{const t=Date.parse(value);return Number.isFinite(t)?new Date(t+KST_OFFSET_MS).toISOString().slice(0,10):''};

  function fromPlatformOrder(row,store=''){
    const provider=text(row?.provider,40).toLowerCase()||'unknown';
    const providerOrderId=text(row?.order_no??row?.external_order_ref??row?.order_display_no,120);
    const status=PLATFORM_STATUS[text(row?.status,40).toLowerCase()]||'unknown';
    const total=money(row?.total);
    return Object.freeze({
      id:'platform:'+provider+':'+(text(row?.id,80)||providerOrderId),
      store:text(store,60),
      provider,
      provider_label:providerLabel(provider),
      provider_order_id:providerOrderId,
      order_type:orderType(row?.fulfillment_type||'delivery'),
      status,
      provider_status:text(row?.status,40),
      ordered_at:iso(row?.ordered_at),
      customer:Object.freeze({display:text(row?.customer_display,60),area_hint:text(row?.delivery_area_hint,60)}),
      items:items(row?.items??row?.item_summary),
      options:[],
      total,
      payment:Object.freeze({gross:total,net_receivable:money(row?.net_receivable),currency:'KRW'}),
      fulfillment:Object.freeze({type:orderType(row?.fulfillment_type||'delivery'),completed_at:iso(row?.completed_at)}),
      raw_reference:Object.freeze({ledger:'store_platform_orders',row_id:text(row?.id,80),provider,provider_order_id:providerOrderId,order_url:text(row?.order_url,500)})
    });
  }

  function fromSmsOrder(row,store=''){
    const status=SMS_STATUS[text(row?.status,40).toLowerCase()]||'unknown';
    const id=text(row?.id,40);
    return Object.freeze({
      id:'sms:'+id,
      store:text(store||row?.store_slug,60),
      provider:'sms',
      provider_label:providerLabel('sms'),
      provider_order_id:id,
      order_type:'unknown',
      status,
      provider_status:text(row?.status,40),
      ordered_at:iso(row?.created_at),
      customer:Object.freeze({display:text(row?.customer_display,60),area_hint:''}),
      // Free-text SMS orders are not parsed into menu items; the raw text stays in its ledger.
      items:[],
      options:[],
      total:null,
      payment:Object.freeze({gross:null,net_receivable:null,currency:'KRW'}),
      fulfillment:Object.freeze({type:'unknown',completed_at:iso(row?.completed_at)}),
      raw_reference:Object.freeze({ledger:'store_sms_orders',row_id:id,provider:'sms',provider_order_id:id,order_url:''})
    });
  }

  function normalizeOrders({platformOrders=[],smsOrders=[],store=''}={}){
    const rows=[
      ...(Array.isArray(platformOrders)?platformOrders:[]).map(row=>fromPlatformOrder(row,store)),
      ...(Array.isArray(smsOrders)?smsOrders:[]).map(row=>fromSmsOrder(row,store))
    ];
    const seen=new Set();
    return rows.filter(row=>{if(seen.has(row.id))return false;seen.add(row.id);return true})
      .sort((a,b)=>String(b.ordered_at||'').localeCompare(String(a.ordered_at||'')));
  }

  // Today summary for the POS console. Only real ledger rows are counted.
  function summarizeToday(orders=[],{now=Date.now(),truncated=false}={}){
    const today=kstDay(new Date(now).toISOString());
    const todays=(Array.isArray(orders)?orders:[]).filter(row=>kstDay(row.ordered_at)===today);
    let sales=0,salesKnown=false;
    const byProvider={};
    for(const row of todays){
      if(row.status==='completed'&&row.total!=null){sales+=row.total;salesKnown=true}
      byProvider[row.provider]=(byProvider[row.provider]||0)+1;
    }
    return Object.freeze({
      day:today,
      orders:todays.length,
      sales:salesKnown?sales:0,
      newOrders:todays.filter(row=>row.status==='new').length,
      needsAction:todays.filter(row=>row.status==='new'||row.status==='pending_customer').length,
      inProgress:todays.filter(row=>row.status==='in_progress'||row.status==='in_delivery').length,
      byProvider:Object.freeze(byProvider),
      truncated:Boolean(truncated)
    });
  }

  // How a channel is actually reachable. Never claims an API that is not active.
  function channelMode({connector=null,agentTarget=null}={}){
    const status=text(connector?.status||connector?.connection_status,40).toLowerCase();
    const source=text(connector?.source_kind,40).toLowerCase();
    if(connector&&ACTIVE_CONNECTOR.has(status)){
      if(source==='official_api'||!source)return Object.freeze({mode:'official_api',label:'공식 연결',tone:'live'});
      if(source==='partner_import')return Object.freeze({mode:'partner_import',label:'파트너 자료',tone:'live'});
      return Object.freeze({mode:'verified_data',label:'검증 자료',tone:'warn'});
    }
    if(connector&&BROKEN_CONNECTOR.has(status))return Object.freeze({mode:'broken',label:'연결 이상',tone:'bad'});
    if(agentTarget&&agentTarget.configured)return Object.freeze({mode:'windows_app',label:'Windows 앱 전환 방식',tone:'warn'});
    return Object.freeze({mode:'not_connected',label:'미연결',tone:'warn'});
  }

  function brokenConnectorCount(connectors=[]){
    return (Array.isArray(connectors)?connectors:[]).filter(row=>BROKEN_CONNECTOR.has(text(row?.status||row?.connection_status,40).toLowerCase())).length;
  }

  return Object.freeze({CANONICAL_STATUSES,ORDER_TYPES,providerLabel,kstDay,fromPlatformOrder,fromSmsOrder,normalizeOrders,summarizeToday,channelMode,brokenConnectorCount});
}

export const STORE_ORDER_MODEL=createStoreOrderModel();
