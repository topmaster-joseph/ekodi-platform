// Signed-in, non-personal market comparison universe. No current-price claims without a licensed data feed.
import { principalFromSupabaseRequest } from './ekodi-principal.js';
const MARKETS=new Set(['all','kr','us','etf']);
const PERIODS=new Set(['1w','1m','3m','1y','3y']);
const TARGETS=new Set(['5','10','20','30']);
export const INVEST_COMMON_CANDIDATES=Object.freeze([
 Object.freeze({name:'삼성전자',ticker:'005930',market:'kr',factors:'반도체 업황·공시'}),
 Object.freeze({name:'SK하이닉스',ticker:'000660',market:'kr',factors:'HBM 수요·변동성'}),
 Object.freeze({name:'Microsoft',ticker:'MSFT',market:'us',factors:'클라우드·AI 실적'}),
 Object.freeze({name:'NVIDIA',ticker:'NVDA',market:'us',factors:'AI 수요·기업가치'}),
 Object.freeze({name:'S&P 500 ETF',ticker:'SPY',market:'etf',factors:'미국 대형주 분산·비용'}),
 Object.freeze({name:'Nasdaq 100 ETF',ticker:'QQQ',market:'etf',factors:'기술주 집중·금리'})
]);
function respond(data,status=200,headers={}){
 return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow, noarchive','vary':'authorization, origin',...headers}});
}
export async function handleInvestCommonAnalysisApi(request,env={}){
 const path=new URL(request.url).pathname.replace(/\/+$/,'');
 if(path!=='/v1/invest/common-analysis')return null;
 const origin=request.headers.get('origin')||'';
 const allowed=[new URL(request.url).origin,'https://ekodi.kr',...String(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)];
 if(origin&&!allowed.includes(origin))return respond({error:'origin_forbidden'},403);
 const cors=origin?{'access-control-allow-origin':origin,'access-control-allow-headers':'authorization','access-control-allow-methods':'GET, OPTIONS'}:{};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'cache-control':'no-store'}});
 if(request.method!=='GET')return respond({error:'method_not_allowed'},405,{'allow':'GET, OPTIONS',...cors});
 const principal=await principalFromSupabaseRequest(request).catch(()=>null);
 if(!principal)return respond({error:'auth_required'},401,cors);
 const url=new URL(request.url);
 const market=url.searchParams.get('market')||'all',period=url.searchParams.get('period')||'3m',target=url.searchParams.get('target')||'10';
 if(!MARKETS.has(market)||!PERIODS.has(period)||!TARGETS.has(target))return respond({error:'invalid_filter'},400,cors);
 const candidates=INVEST_COMMON_CANDIDATES.filter(c=>market==='all'||c.market===market);
 return respond({
  schema:'ekodi.invest.common-analysis.v1',
  market,period,targetReturnPct:Number(target),
  candidates,
  provenance:{kind:'reference-universe',marketDataVerified:false,asOf:null,priceProvider:null},
  policy:{personalized:false,memberOnly:true,investmentAdvice:false,ordersEnabled:false,estimatedReturnAvailable:false,guaranteedReturn:false}
 },200,cors);
}
