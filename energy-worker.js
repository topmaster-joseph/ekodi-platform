function securityHeaders(){return{'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data:; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...securityHeaders()}})}
function withHeaders(response){const headers=new Headers(response.headers);for(const [key,value]of Object.entries(securityHeaders()))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
function boundedNumber(value,min,max,fallback=0){const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
function runtimeConfig(env={}){return{telemetryEnabled:env.TELEMETRY_ENABLED==='true',telemetryMode:env.TELEMETRY_MODE||'isolated-staging',controlEnabled:env.CONTROL_ENABLED==='true',controlPolicy:'observe-suggest-approve-bounded',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=energy'}}

const PILOT_SITES={
  'pizzamaru-mokpo-01':{
    siteId:'pizzamaru-mokpo-01',
    storeName:'피자마루 목포대점',
    pilotNumber:1,
    mode:'bill-baseline-readonly',
    required:['month','kwh','amount'],
    ami:'connection_required',
    circuitSensors:'optional_phase2',
    controlEnabled:false,
    strategy:['bill_baseline','ami_time_series','selective_ct_sensors','approved_low_risk_control']
  }
};

function pilotSite(siteId){return PILOT_SITES[siteId]||null}
function connectorCatalog(siteId){
  if(!pilotSite(siteId))return null;
  return[
    {id:'bill-manual',kind:'bill',label:'전기고지서 직접 입력',status:'ready',priority:1,requiresUserInput:true},
    {id:'google-drive-bill',kind:'document',label:'Google Drive 고지서',status:'adapter_contract_ready',priority:2,requiresUserConsent:true,live:false},
    {id:'gmail-bill',kind:'document',label:'Gmail 고지서',status:'adapter_contract_ready',priority:2,requiresUserConsent:true,live:false},
    {id:'korea-ami',kind:'ami',label:'AMI 시간대별 사용량',status:'connection_required',priority:3,requiresUserConsent:true,live:false},
    {id:'ct-sensor',kind:'sensor',label:'분전반 CT 센서',status:'optional_phase2',priority:4,requiresInstallation:true,live:false}
  ]
}

function buildBillInsight(history=[],siteId='pizzamaru-mokpo-01'){
  const rows=history.filter(r=>r&&r.month&&Number(r.kwh)>0&&Number(r.amount)>0).sort((a,b)=>String(a.month).localeCompare(String(b.month)));
  if(rows.length<2)return{title:'최근 전기고지서 데이터가 더 필요합니다.',body:'최소 2개월, 권장 4~12개월의 사용량(kWh)과 청구금액을 입력하면 기준선과 증가 원인을 비교할 수 있습니다.',actuationRequested:false,siteId};
  const latest=rows.at(-1);const prev=rows.slice(Math.max(0,rows.length-4),-1);const avg=k=>prev.reduce((sum,r)=>sum+Number(r[k]||0),0)/prev.length;
  const baseKwh=avg('kwh'),baseAmount=avg('amount'),latestKwh=Number(latest.kwh),latestAmount=Number(latest.amount);const usageDelta=baseKwh?((latestKwh-baseKwh)/baseKwh)*100:0;const billDelta=baseAmount?((latestAmount-baseAmount)/baseAmount)*100:0;const unitNow=latestKwh?latestAmount/latestKwh:0;const baseUnit=baseKwh?baseAmount/baseKwh:0;const unitDelta=baseUnit?((unitNow-baseUnit)/baseUnit)*100:0;const excess=Math.max(0,latestAmount-baseAmount);
  let title='최근 전기요금은 기준선과 큰 차이가 없습니다.';let body='현재 고지서 데이터만으로 뚜렷한 이상 증가 신호는 크지 않습니다. 더 긴 기간을 입력하면 계절성을 더 잘 볼 수 있습니다.';
  if(usageDelta>=15){title='전기요금 증가의 1차 원인은 사용량 급증입니다.';body=`최근 사용량이 직전 기준선보다 약 ${usageDelta.toFixed(1)}% 높습니다. 초과비용 후보는 약 ${Math.round(excess).toLocaleString('ko-KR')}원입니다. AMI를 연결해 영업 종료 후 사용과 피크 시간을 확인하는 것이 다음 단계입니다.`}
  else if(unitDelta>=10){title='사용량보다 kWh당 비용 증가를 먼저 점검해야 합니다.';body=`kWh당 비용이 기준선보다 약 ${unitDelta.toFixed(1)}% 높습니다. 계약전력, 기본요금, 요금제와 청구 항목을 먼저 확인하세요.`}
  else if(billDelta>=10){title='최근 청구금액이 기준선보다 높습니다.';body=`청구금액이 약 ${billDelta.toFixed(1)}% 증가했습니다. 날씨와 영업일수를 보정한 뒤 AMI 시간대 데이터를 연결하면 원인을 더 좁힐 수 있습니다.`}
  return{title,body,actuationRequested:false,siteId,evidence:{latestMonth:latest.month,usageDelta:Math.round(usageDelta*10)/10,billDelta:Math.round(billDelta*10)/10,unitDelta:Math.round(unitDelta*10)/10,excessCandidate:Math.round(excess)}}
}
function buildInsight(body={}){if(Array.isArray(body.billingHistory))return buildBillInsight(body.billingHistory,String(body.siteId||'pizzamaru-mokpo-01'));const t=body.telemetry||{};const solar=boundedNumber(t.solarNow,0,100,0);const home=boundedNumber(t.homeNow,0,100,0);const soc=boundedNumber(t.essSoc,0,100,0);const surplus=Math.max(0,solar-home);let title='현재는 에너지 흐름을 관찰하는 것이 좋습니다.';let text='발전량과 소비량이 안정 범위에 있는지 계속 비교하고, 충분한 데이터가 쌓인 뒤 자동화 범위를 넓히세요.';if(surplus>=1){title='정오 잉여 태양광 시간대로 부하를 옮겨 보세요.';text=`현재 샘플 기준 잉여전력이 약 ${surplus.toFixed(1)} kW입니다. 세탁·건조·온수·EV 충전처럼 시간 이동이 가능한 부하를 태양광 생산시간에 맞추는 방안을 권합니다.`}else if(solar>0&&home>solar){title='계통 구매전력이 늘고 있습니다.';text='필수 부하는 유지하고, 시간 이동이 가능한 대형 가전이나 EV 충전을 다음 태양광 생산 구간으로 예약하는 방안을 검토하세요.'}if(soc<25){title='ESS 비상 여유를 먼저 확보하세요.';text='배터리 잔량이 낮습니다. 비용 최적화보다 비상용 예비전력 기준을 우선하고 방전 자동화를 제한하는 편이 안전합니다.'}return{title,body:text,actuationRequested:false}}
const permanentlyBlocked=new Set(['breaker_off','breaker_trip','protection_override','protection_setting_change','inverter_safety_change','emergency_control','safety_interlock_bypass']);
const lowRisk=new Set(['schedule_load','ev_charge_schedule','ess_charge_target','water_heater_schedule']);
function checkAction(env,body={}){const cfg=runtimeConfig(env);const action=String(body.action||'').trim();const mode=boundedNumber(body.controlMode,0,3,0);if(!action)return{allowed:false,reason:'action_required',executable:false};if(permanentlyBlocked.has(action))return{allowed:false,reason:'safety_boundary_permanent',executable:false};if(!lowRisk.has(action))return{allowed:false,reason:'unsupported_action',executable:false};if(mode<2)return{allowed:false,reason:'human_approval_required',executable:false};if(!cfg.controlEnabled)return{allowed:true,reason:'policy_allows_but_control_adapter_disabled',executable:false};return{allowed:true,reason:mode===2?'approved_low_risk_action':'bounded_automation_rule',executable:true}}
async function requestJson(request){try{return await request.json()}catch{return null}}

export default{async fetch(request,env){
  const url=new URL(request.url);const cfg=runtimeConfig(env);
  if(url.pathname==='/config.js')return new Response(`window.EKODI_ENERGY_CONFIG=${JSON.stringify(cfg)};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders()}});
  if(url.pathname==='/health')return json({ok:true,service:'ekodi-energy-ai',apiVersion:'v1',stage:cfg.telemetryMode,telemetryEnabled:cfg.telemetryEnabled,controlEnabled:cfg.controlEnabled,safetyPolicy:cfg.controlPolicy,pilot:'pizzamaru-mokpo-01'});
  if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/energy',307);
  if(request.method==='GET'&&(url.pathname==='/pizzamaru'||url.pathname==='/pizzamaru/')){const assetUrl=new URL(request.url);assetUrl.pathname='/';assetUrl.search='';return withHeaders(await env.ASSETS.fetch(new Request(assetUrl.toString(),request)))}
  if(request.method==='GET'&&url.pathname==='/api/pilot/pizzamaru-mokpo-01')return json(pilotSite('pizzamaru-mokpo-01'));
  if(request.method==='GET'&&url.pathname==='/api/energy/v1/pilots/pizzamaru-mokpo-01')return json(pilotSite('pizzamaru-mokpo-01'));
  if(request.method==='GET'&&url.pathname==='/api/energy/v1/pilots/pizzamaru-mokpo-01/connectors')return json({siteId:'pizzamaru-mokpo-01',connectors:connectorCatalog('pizzamaru-mokpo-01')});
  if(request.method==='POST'&&(url.pathname==='/api/insight'||url.pathname==='/api/energy/v1/insight')){const body=await requestJson(request);if(!body)return json({error:'invalid_json'},400);const siteId=String(body.siteId||'pizzamaru-mokpo-01');if(body.billingHistory&&!pilotSite(siteId))return json({error:'unknown_site'},404);return json({mode:'explainable-rule-mvp',apiVersion:'v1',insight:buildInsight({...body,siteId})});}
  if(request.method==='POST'&&url.pathname==='/api/action-check'){const body=await requestJson(request);if(!body)return json({error:'invalid_json'},400);return json({policy:cfg.controlPolicy,...checkAction(env,body)});}
  if(url.pathname.startsWith('/api/'))return json({error:'not_found'},404);
  return withHeaders(await env.ASSETS.fetch(request))
}};
