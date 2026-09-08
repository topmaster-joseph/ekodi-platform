import { d1SchemaReady } from './d1-schema-readiness.js';

const ACCOUNT_ID = 'coupang-ekodibiz';
const STOREFRONT = 'ekodi-mall';
const NAVER_SHOPPING_URL = 'https://naverapihub.apigw.ntruss.com/shopping/v1/categories';
const KOSIS_DATA_URL = 'https://kosis.kr/openapi/statisticsData.do';
const PRIMARY_LIMIT = 7;
const BACKUP_LIMIT = 10;
const MAX_PRIMARY_PER_CATEGORY = 2;
const MAX_BACKUP_PER_CATEGORY = 3;

const NAVER_ROOTS = Object.freeze([
  {name:'패션의류',id:'50000000',tokens:['패션','의류']},
  {name:'패션잡화',id:'50000001',tokens:['잡화','가방','신발','액세서리']},
  {name:'화장품/미용',id:'50000002',tokens:['화장품','미용','뷰티']},
  {name:'디지털/가전',id:'50000003',tokens:['디지털','가전','전자','컴퓨터']},
  {name:'가구/인테리어',id:'50000004',tokens:['가구','인테리어']},
  {name:'출산/육아',id:'50000005',tokens:['출산','육아','유아']},
  {name:'식품',id:'50000006',tokens:['식품','간편식','먹거리','선물']},
  {name:'스포츠/레저',id:'50000007',tokens:['스포츠','레저','캠핑','운동']},
  {name:'생활/건강',id:'50000008',tokens:['생활','주방','건강','계절','청소','수납']},
  {name:'여가/생활편의',id:'50000009',tokens:['여가','생활편의','여행']},
]);

const KOSIS_ALIASES = Object.freeze({
  '생활':['생활용품'],
  '주방':['생활용품'],
  '건강':['생활용품','화장품'],
  '식품':['음·식료품','음식료품','농축수산물'],
  '디지털':['가전·전자·통신기기','가전','컴퓨터 및 주변기기'],
});

const clean = (value,max=240) => String(value ?? '').trim().slice(0,max);
const nowIso = () => new Date().toISOString();
const safeJson = value => { try { return JSON.stringify(value ?? {}); } catch { return '{}'; } };
const safeParse = value => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
const average = values => values.length ? values.reduce((sum,value)=>sum+(Number(value)||0),0)/values.length : 0;
const numeric = value => Number(String(value ?? '').replaceAll(',','')) || 0;

function addDays(dateText,delta) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()+delta);
  return date.toISOString().slice(0,10);
}

export function isoWeekInfo(date=new Date()) {
  const shifted = new Date(date.getTime()+9*60*60*1000);
  const local = new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate()));
  const weekday = local.getUTCDay() || 7;
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate()-(weekday-1));
  const thursday = new Date(local);
  thursday.setUTCDate(local.getUTCDate()+(4-weekday));
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year,0,1));
  const week = Math.ceil((((thursday-yearStart)/86400000)+1)/7);
  const startDate = monday.toISOString().slice(0,10);
  return {
    weekKey:`${year}-W${String(week).padStart(2,'0')}`,
    startDate,
    endDate:addDays(startDate,6),
    daySlot:weekday,
    date:local.toISOString().slice(0,10),
  };
}

function ratioMomentum(current,previous) {
  const cur=Number(current)||0, prev=Number(previous)||0;
  if (prev<=0) return cur>0 ? 1 : 0;
  return Math.max(-1,Math.min(3,(cur-prev)/prev));
}

function naverRootForCategory(category) {
  const text=clean(category,80).toLowerCase();
  return NAVER_ROOTS.find(root=>root.tokens.some(token=>text.includes(token.toLowerCase()))) || NAVER_ROOTS[8];
}

function chunks(values,size) {
  const result=[];
  for(let index=0;index<values.length;index+=size) result.push(values.slice(index,index+size));
  return result;
}

async function officialSchemaReady(env) {
  return d1SchemaReady(env?.DB,[
    'affiliate_storefront_products',
    'affiliate_product_performance_daily',
    'affiliate_growth_opportunities',
    'affiliate_official_market_signals',
    'affiliate_promotion_weekly_boards',
    'affiliate_promotion_weekly_products',
  ]);
}

async function recordSignal(env,{date,source,key,category,current=0,previous=0,momentum=0,evidence={}}) {
  const observedAt=nowIso();
  await env.DB.prepare(`INSERT INTO affiliate_official_market_signals
    (observed_date,source,signal_key,category,current_value,previous_value,momentum,evidence_json,observed_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(observed_date,source,signal_key) DO UPDATE SET
      category=excluded.category,current_value=excluded.current_value,previous_value=excluded.previous_value,
      momentum=excluded.momentum,evidence_json=excluded.evidence_json,observed_at=excluded.observed_at,expires_at=excluded.expires_at`)
    .bind(date,source,clean(key,160),clean(category,120),Number(current)||0,Number(previous)||0,Number(momentum)||0,safeJson(evidence),observedAt,`${addDays(date,35)}T14:59:59Z`).run();
}

function naverConfigured(env) {
  return Boolean(env?.NAVER_API_HUB_CLIENT_ID && env?.NAVER_API_HUB_CLIENT_SECRET);
}

async function refreshNaverShoppingSignals(env,categories,runDate) {
  if (!naverConfigured(env)) return {status:'credentials_required',count:0};
  const roots=[...new Map(categories.map(category=>{
    const root=naverRootForCategory(category);
    return [root.id,root];
  })).values()];
  const rootSignals=new Map();
  const startDate=addDays(runDate,-13);
  for(const group of chunks(roots,3)) {
    const response=await fetch(NAVER_SHOPPING_URL,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'X-NCP-APIGW-API-KEY-ID':String(env.NAVER_API_HUB_CLIENT_ID),
        'X-NCP-APIGW-API-KEY':String(env.NAVER_API_HUB_CLIENT_SECRET),
      },
      body:JSON.stringify({startDate,endDate:runDate,timeUnit:'date',category:group.map(root=>({name:root.name,param:[root.id]}))}),
    });
    if(!response.ok) throw new Error(`NAVER_SHOPPING_HTTP_${response.status}`);
    const payload=await response.json().catch(()=>({}));
    for(const result of payload.results||[]) {
      const rows=Array.isArray(result.data)?result.data:[];
      const previous=average(rows.slice(0,7).map(row=>row.ratio));
      const current=average(rows.slice(-7).map(row=>row.ratio));
      const rootId=Array.isArray(result.category)?String(result.category[0]||''):String(result.category||'');
      rootSignals.set(rootId,{title:clean(result.title,80),current,previous,momentum:ratioMomentum(current,previous)});
    }
  }
  let count=0;
  for(const category of categories) {
    const root=naverRootForCategory(category);
    const signal=rootSignals.get(root.id);
    if(!signal) continue;
    await recordSignal(env,{date:runDate,source:'naver_shopping_insight',key:`category:${category}`,category,current:signal.current,previous:signal.previous,momentum:signal.momentum,evidence:{provider:'NAVER API HUB Shopping Insight',rootCategory:root.name,rootCategoryId:root.id,windowDays:14}});
    count+=1;
  }
  return {status:'ok',count,roots:roots.map(root=>root.name)};
}

function kosisConfigured(env) {
  return Boolean(env?.KOSIS_API_KEY && env?.KOSIS_ONLINE_SHOPPING_USER_STATS_ID);
}

function kosisRowText(row={}) {
  return [row.C1_NM,row.C2_NM,row.C3_NM,row.C4_NM,row.C5_NM,row.C6_NM,row.C7_NM,row.C8_NM,row.ITM_NM].filter(Boolean).join(' ');
}

async function refreshKosisSignals(env,categories,runDate) {
  if(!kosisConfigured(env)) return {status:'table_registration_required',count:0};
  const url=new URL(KOSIS_DATA_URL);
  url.searchParams.set('method','getList');
  url.searchParams.set('apiKey',String(env.KOSIS_API_KEY));
  url.searchParams.set('format','json');
  url.searchParams.set('jsonVD','Y');
  url.searchParams.set('userStatsId',String(env.KOSIS_ONLINE_SHOPPING_USER_STATS_ID));
  url.searchParams.set('prdSe','M');
  url.searchParams.set('newEstPrdCnt','2');
  url.searchParams.set('prdInterval','1');
  const response=await fetch(url.href);
  if(!response.ok) throw new Error(`KOSIS_HTTP_${response.status}`);
  const rows=await response.json().catch(()=>[]);
  if(!Array.isArray(rows)) throw new Error('KOSIS_RESPONSE_INVALID');
  let count=0;
  for(const category of categories) {
    const aliases=KOSIS_ALIASES[clean(category,40)]||[];
    if(!aliases.length) continue;
    const matched=rows.filter(row=>aliases.some(alias=>kosisRowText(row).includes(alias)));
    if(!matched.length) continue;
    const byPeriod=new Map();
    for(const row of matched) byPeriod.set(String(row.PRD_DE||''),(byPeriod.get(String(row.PRD_DE||''))||0)+numeric(row.DT));
    const periods=[...byPeriod.keys()].filter(Boolean).sort();
    const previous=periods.length>1?byPeriod.get(periods[periods.length-2]):0;
    const current=periods.length?byPeriod.get(periods[periods.length-1]):0;
    const momentum=ratioMomentum(current,previous);
    await recordSignal(env,{date:runDate,source:'kosis_online_shopping',key:`category:${category}`,category,current,previous,momentum,evidence:{provider:'KOSIS',table:'online-shopping registered table',latestPeriod:periods[periods.length-1]||'',matchedRows:matched.length}});
    count+=1;
  }
  return {status:'ok',count};
}

async function refreshOfficialSignals(env,categories,runDate) {
  const result={};
  try { result.naverShopping=await refreshNaverShoppingSignals(env,categories,runDate); }
  catch(error){ result.naverShopping={status:'error',error:clean(error?.message||error,300),count:0}; }
  const recentKosis=await env.DB.prepare(`SELECT observed_date FROM affiliate_official_market_signals
    WHERE source='kosis_online_shopping' AND observed_date>=? ORDER BY observed_date DESC LIMIT 1`)
    .bind(addDays(runDate,-25)).first().catch(()=>null);
  if(recentKosis) result.kosis={status:'cached',observedDate:recentKosis.observed_date};
  else {
    try { result.kosis=await refreshKosisSignals(env,categories,runDate); }
    catch(error){ result.kosis={status:'error',error:clean(error?.message||error,300),count:0}; }
  }
  return result;
}

async function loadLatestSignals(env,categories,runDate) {
  const rows=await env.DB.prepare(`SELECT source,category,current_value,previous_value,momentum,observed_date,evidence_json
    FROM affiliate_official_market_signals
    WHERE observed_date>=? AND category<>'' ORDER BY observed_date DESC,id DESC`)
    .bind(addDays(runDate,-35)).all();
  const signals=new Map();
  for(const row of rows.results||[]) {
    const key=`${row.source}:${row.category}`;
    if(!signals.has(key)) signals.set(key,{source:row.source,category:row.category,current:Number(row.current_value||0),previous:Number(row.previous_value||0),momentum:Number(row.momentum||0),observedDate:row.observed_date,evidence:safeParse(row.evidence_json)});
  }
  const result=new Map();
  for(const category of categories) {
    result.set(category,{
      naver:signals.get(`naver_shopping_insight:${category}`)||null,
      kosis:signals.get(`kosis_online_shopping:${category}`)||null,
    });
  }
  return result;
}

async function loadProducts(env) {
  const result=await env.DB.prepare(`SELECT p.id,p.product_id,p.product_name,p.category,p.provider_rank,p.selection_score,p.price_krw,p.is_rocket,p.is_free_shipping,
      COALESCE(m.orders_30d,0) AS orders_30d,COALESCE(m.cancels_30d,0) AS cancels_30d,COALESCE(m.commission_30d,0) AS commission_30d,
      COALESCE(o.recommended_action,'hold') AS recommended_action,COALESCE(o.campaign_angle,'') AS campaign_angle,COALESCE(o.opportunity_score,0) AS opportunity_score
    FROM affiliate_storefront_products p
    LEFT JOIN (
      SELECT product_row_id,SUM(orders) AS orders_30d,SUM(cancels) AS cancels_30d,SUM(commission_krw) AS commission_30d
      FROM affiliate_product_performance_daily WHERE metric_date>=date('now','-29 day') GROUP BY product_row_id
    ) m ON m.product_row_id=p.id
    LEFT JOIN affiliate_growth_opportunities o ON o.product_row_id=p.id
      AND o.run_date=(SELECT MAX(run_date) FROM affiliate_growth_opportunities)
    WHERE p.account_id=? AND p.storefront_slug=? AND p.status='active'
    ORDER BY CASE WHEN p.provider_rank>0 THEN p.provider_rank ELSE 9999 END,p.id DESC`)
    .bind(ACCOUNT_ID,STOREFRONT).all();
  return result.results||[];
}

function directionFor(signals={}) {
  const values=[signals.naver?.momentum,signals.kosis?.momentum].filter(value=>Number.isFinite(Number(value))).map(Number);
  if(!values.length) return {direction:'unknown',priority:2};
  if(values.some(value=>value>=0.15)) return {direction:'rising',priority:0};
  if(values.every(value=>value<=-0.15)) return {direction:'falling',priority:3};
  return {direction:'stable',priority:1};
}

function decoratedProduct(product,signalPair={}) {
  const signal=directionFor(signalPair);
  const providerRank=Number(product.provider_rank)>0?Number(product.provider_rank):9999;
  const netOrders=Math.max(0,Number(product.orders_30d||0)-Number(product.cancels_30d||0));
  return {...product,providerRank,netOrders,signalDirection:signal.direction,signalPriority:signal.priority,signalPair};
}

export function chooseWeeklyCandidates(products,signalPairs=new Map(),primaryLimit=PRIMARY_LIMIT,backupLimit=BACKUP_LIMIT) {
  const ranked=products.map(product=>decoratedProduct(product,signalPairs.get(clean(product.category,120))||{}))
    .sort((a,b)=>a.signalPriority-b.signalPriority||a.providerRank-b.providerRank||b.netOrders-a.netOrders||Number(b.commission_30d||0)-Number(a.commission_30d||0)||Number(a.id)-Number(b.id));
  const pick=(pool,limit,maxPerCategory,used)=> {
    const selected=[], counts=new Map();
    for(const row of pool) {
      if(used.has(Number(row.id))) continue;
      const category=clean(row.category||'기타',80);
      if((counts.get(category)||0)>=maxPerCategory) continue;
      selected.push(row); used.add(Number(row.id)); counts.set(category,(counts.get(category)||0)+1);
      if(selected.length>=limit) break;
    }
    if(selected.length<limit) {
      for(const row of pool) {
        if(used.has(Number(row.id))) continue;
        selected.push(row); used.add(Number(row.id));
        if(selected.length>=limit) break;
      }
    }
    return selected;
  };
  const used=new Set();
  const primary=pick(ranked,primaryLimit,MAX_PRIMARY_PER_CATEGORY,used);
  const backup=pick(ranked,backupLimit,MAX_BACKUP_PER_CATEGORY,used);
  return {primary,backup};
}

function evidenceFor(row) {
  return {
    selectionRule:'official_signals_then_platform_rank_then_ekodi_tiebreak',
    providerRank:row.providerRank===9999?null:row.providerRank,
    signalDirection:row.signalDirection,
    naverShopping:row.signalPair?.naver?{momentum:row.signalPair.naver.momentum,observedDate:row.signalPair.naver.observedDate}:null,
    kosis:row.signalPair?.kosis?{momentum:row.signalPair.kosis.momentum,observedDate:row.signalPair.kosis.observedDate}:null,
    ekodiTieBreak:{netOrders30d:row.netOrders,commission30d:Number(row.commission_30d||0)},
  };
}

async function writeBoard(env,week,sources,selection) {
  const now=nowIso();
  const degraded=Object.values(sources).some(source=>source?.status==='error');
  const status=degraded?'degraded':'completed';
  const statements=[
    env.DB.prepare('DELETE FROM affiliate_promotion_weekly_products WHERE week_key=?').bind(week.weekKey),
    env.DB.prepare(`INSERT INTO affiliate_promotion_weekly_boards
      (week_key,week_start,week_end,status,selection_mode,source_status_json,primary_count,backup_count,generated_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(week_key) DO UPDATE SET week_start=excluded.week_start,week_end=excluded.week_end,status=excluded.status,
      selection_mode=excluded.selection_mode,source_status_json=excluded.source_status_json,primary_count=excluded.primary_count,
      backup_count=excluded.backup_count,generated_at=excluded.generated_at,updated_at=excluded.updated_at`)
      .bind(week.weekKey,week.startDate,week.endDate,status,'official_signal_v1',safeJson(sources),selection.primary.length,selection.backup.length,now,now),
  ];
  for(const [index,row] of selection.primary.entries()) statements.push(env.DB.prepare(`INSERT INTO affiliate_promotion_weekly_products
    (week_key,tier,slot,product_row_id,product_id,category,provider_rank,signal_direction,evidence_json,selected_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(week.weekKey,'A',index+1,Number(row.id),clean(row.product_id,100),clean(row.category,120),row.providerRank===9999?0:row.providerRank,row.signalDirection,safeJson(evidenceFor(row)),now));
  for(const [index,row] of selection.backup.entries()) statements.push(env.DB.prepare(`INSERT INTO affiliate_promotion_weekly_products
    (week_key,tier,slot,product_row_id,product_id,category,provider_rank,signal_direction,evidence_json,selected_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(week.weekKey,'B',index+1,Number(row.id),clean(row.product_id,100),clean(row.category,120),row.providerRank===9999?0:row.providerRank,row.signalDirection,safeJson(evidenceFor(row)),now));
  await env.DB.batch(statements);
  return status;
}

async function loadTodayProduct(env,week) {
  const select=`SELECT p.id,p.product_id,p.product_name,p.price_krw,p.category,p.provider_rank,p.selection_score,p.is_rocket,p.is_free_shipping,
      w.tier,w.slot,w.signal_direction,w.evidence_json,
      COALESCE(o.opportunity_score,0) AS opportunity_score,COALESCE(o.recommended_action,'hold') AS recommended_action,COALESCE(o.campaign_angle,'') AS campaign_angle
    FROM affiliate_promotion_weekly_products w JOIN affiliate_storefront_products p ON p.id=w.product_row_id
    LEFT JOIN affiliate_growth_opportunities o ON o.product_row_id=p.id AND o.run_date=(SELECT MAX(run_date) FROM affiliate_growth_opportunities)
    WHERE w.week_key=? AND w.tier=? AND w.slot=? AND p.account_id=? AND p.storefront_slug=? AND p.status='active' LIMIT 1`;
  let row=await env.DB.prepare(select).bind(week.weekKey,'A',week.daySlot,ACCOUNT_ID,STOREFRONT).first();
  if(!row) row=await env.DB.prepare(select).bind(week.weekKey,'B',1,ACCOUNT_ID,STOREFRONT).first();
  return row?{...row,boardEvidence:safeParse(row.evidence_json)}:null;
}

export async function ensureWeeklyPromotionBoard(env,{reason='cron',force=false,date=new Date()}={}) {
  if(!(await officialSchemaReady(env))) return {ok:false,status:'schema_required'};
  const week=isoWeekInfo(date);
  const existing=await env.DB.prepare('SELECT status,source_status_json,primary_count,backup_count,generated_at FROM affiliate_promotion_weekly_boards WHERE week_key=?').bind(week.weekKey).first();
  if(existing && !force) {
    const todayProduct=await loadTodayProduct(env,week);
    return {ok:true,status:'ready',...week,boardStatus:existing.status,sources:safeParse(existing.source_status_json),primaryCount:Number(existing.primary_count||0),backupCount:Number(existing.backup_count||0),generatedAt:existing.generated_at,todayProduct};
  }
  const products=await loadProducts(env);
  if(!products.length) return {ok:true,status:'no_products',...week,todayProduct:null};
  const categories=[...new Set(products.map(row=>clean(row.category,120)).filter(Boolean))];
  const sources=await refreshOfficialSignals(env,categories,week.date);
  const signalPairs=await loadLatestSignals(env,categories,week.date);
  const selection=chooseWeeklyCandidates(products,signalPairs);
  const boardStatus=await writeBoard(env,week,{...sources,reason},selection);
  const todayProduct=await loadTodayProduct(env,week);
  return {ok:true,status:'built',...week,boardStatus,sources,primaryCount:selection.primary.length,backupCount:selection.backup.length,todayProduct};
}

export async function getWeeklyPromotionBoardStatus(env,date=new Date()) {
  if(!(await officialSchemaReady(env))) return {enabled:true,schemaReady:false,status:'schema_required'};
  const week=isoWeekInfo(date);
  const board=await env.DB.prepare('SELECT * FROM affiliate_promotion_weekly_boards WHERE week_key=?').bind(week.weekKey).first().catch(()=>null);
  if(!board) return {enabled:true,schemaReady:true,status:'not_built',weekKey:week.weekKey,weekStart:week.startDate,weekEnd:week.endDate,daySlot:week.daySlot};
  const rows=await env.DB.prepare(`SELECT w.tier,w.slot,w.product_row_id,w.product_id,w.category,w.provider_rank,w.signal_direction,w.evidence_json,p.product_name
    FROM affiliate_promotion_weekly_products w JOIN affiliate_storefront_products p ON p.id=w.product_row_id
    WHERE w.week_key=? ORDER BY CASE w.tier WHEN 'A' THEN 1 ELSE 2 END,w.slot`).bind(week.weekKey).all();
  const todayProduct=await loadTodayProduct(env,week);
  return {
    enabled:true,schemaReady:true,status:board.status,weekKey:week.weekKey,weekStart:week.startDate,weekEnd:week.endDate,daySlot:week.daySlot,
    selectionMode:board.selection_mode,sources:safeParse(board.source_status_json),primaryCount:Number(board.primary_count||0),backupCount:Number(board.backup_count||0),
    generatedAt:board.generated_at,todayProduct:todayProduct?{productRowId:Number(todayProduct.id),productId:todayProduct.product_id,productName:todayProduct.product_name,category:todayProduct.category,tier:todayProduct.tier,slot:Number(todayProduct.slot),providerRank:Number(todayProduct.provider_rank||0),signalDirection:todayProduct.signal_direction}:null,
    primary:(rows.results||[]).filter(row=>row.tier==='A').map(row=>({slot:Number(row.slot),productRowId:Number(row.product_row_id),productId:row.product_id,productName:row.product_name,category:row.category,providerRank:Number(row.provider_rank||0),signalDirection:row.signal_direction,evidence:safeParse(row.evidence_json)})),
  };
}

export const OFFICIAL_PROMOTION_DEFAULTS=Object.freeze({
  accountId:ACCOUNT_ID,storefront:STOREFRONT,primaryLimit:PRIMARY_LIMIT,backupLimit:BACKUP_LIMIT,
  naverShoppingUrl:NAVER_SHOPPING_URL,kosisDataUrl:KOSIS_DATA_URL,selectionMode:'official_signal_v1',
});
