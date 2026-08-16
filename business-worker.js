function securityHeaders(){return{'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...securityHeaders()}})}
function withHeaders(response){const headers=new Headers(response.headers);for(const [key,value]of Object.entries(securityHeaders()))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
function boundedNumber(value,min,max,fallback=0){const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
function runtimeConfig(env={}){return{mode:env.BUSINESS_MODE||'isolated-staging',integrationsEnabled:env.INTEGRATIONS_ENABLED==='true',executionEnabled:env.EXECUTION_ENABLED==='true',readiness:boundedNumber(env.READINESS,0,100,62),authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=business',policy:'observe-discern-suggest-approve-act-verify-report',defaultWorkspace:'ekodibiz'}}

const WORKSPACES={
  ekodibiz:{
    id:'ekodibiz',name:'에코디비즈',englishName:'EKODIBIZ',classification:'internal',scope:'organization',accent:'business',
    description:'에코디비즈의 고객, 프로젝트, 마케팅, 업무, 매출과 재무 신호를 한 화면에서 운영하는 내부 Business OS 워크스페이스입니다.',
    publicUrl:'https://biz.ekodi.kr',marketingUrl:'https://marketing.ekodi.kr',workUrl:'https://work.ekodi.kr',
    dataState:'connection_required',dataMessage:'에코디비즈 운영 데이터는 아직 Business OS 읽기 전용 집계 API에 연결되지 않았습니다.',
    modules:[
      {code:'MKT',name:'Marketing AI',description:'콘텐츠·캠페인·채널 운영',status:'available',statusLabel:'허브 연결',href:'https://marketing.ekodi.kr'},
      {code:'CRM',name:'Customer AI',description:'고객·문의·관계·재방문 관리',status:'next',statusLabel:'CRM 원장 연결 대기'},
      {code:'SAL',name:'Sales AI',description:'견적·계약 전 단계·매출 파이프라인',status:'next',statusLabel:'매출 원장 연결 대기'},
      {code:'WRK',name:'Work AI',description:'프로젝트·업무·역할·실행 추적',status:'available',statusLabel:'Work 연결',href:'https://work.ekodi.kr'},
      {code:'FIN',name:'Finance AI',description:'수입·비용·현금흐름·증빙 신호',status:'next',statusLabel:'읽기 전용 재무 연결 대기'},
      {code:'RPT',name:'AI Report',description:'일일 운영요약·이상징후·승인 필요 항목',status:'next',statusLabel:'집계 데이터 연결 후 자동화'}
    ]
  },
  jadam:{
    id:'jadam',name:'자담치킨 목포대점',englishName:'JADAM CHICKEN',classification:'external_client',scope:'store',accent:'store',
    description:'자담치킨 목포대점의 Marketing AI, 고객관계, 매출, 매장업무와 비용 신호를 점포 단위로 분리해 운영하는 고객 Business OS 워크스페이스입니다.',
    publicUrl:'https://jadam.ai.ekodi.kr',marketingUrl:'https://jadam.ai.ekodi.kr',workUrl:'https://work.ekodi.kr',
    dataState:'connection_required',dataMessage:'자담치킨 Marketing AI 워크스페이스는 연결되어 있지만 CRM·POS·재무 지표는 아직 Business OS 읽기 전용 집계 API에 연결되지 않았습니다.',
    modules:[
      {code:'MKT',name:'Marketing AI',description:'자담치킨 전용 콘텐츠·캠페인·채널 운영',status:'available',statusLabel:'전용 워크스페이스 연결',href:'https://jadam.ai.ekodi.kr'},
      {code:'CRM',name:'Customer AI',description:'동의 기반 고객·재방문·휴면고객 관리',status:'next',statusLabel:'고객 원장 연결 대기'},
      {code:'SAL',name:'Sales AI',description:'일매출·주문채널·메뉴 흐름 분석',status:'next',statusLabel:'POS/주문 집계 연결 대기'},
      {code:'WRK',name:'Work AI',description:'매장업무·채용·실행 체크',status:'available',statusLabel:'Work 연결',href:'https://work.ekodi.kr'},
      {code:'FIN',name:'Finance AI',description:'원가·배달수수료·광고비·현금흐름',status:'next',statusLabel:'읽기 전용 재무 연결 대기'},
      {code:'RPT',name:'AI Report',description:'매일 매장 핵심신호와 승인 필요 행동 보고',status:'next',statusLabel:'집계 데이터 연결 후 자동화'}
    ]
  }
};

function workspaceList(){return Object.values(WORKSPACES).map(({id,name,englishName,classification,scope,description,publicUrl,marketingUrl,dataState,dataMessage})=>({id,name,englishName,classification,scope,description,publicUrl,marketingUrl,dataState,dataMessage}))}
function getWorkspace(id){return WORKSPACES[String(id||'').trim().toLowerCase()]||null}
function noDataBrief(workspace){
  if(workspace?.id==='jadam')return[
    {code:'connect_marketing',title:'Marketing AI는 자담치킨 전용 워크스페이스를 기준점으로 사용합니다.',body:'jadam.ai.ekodi.kr를 공식 마케팅 운영면으로 유지하고 Business OS는 그 위의 경영 집계층으로 연결합니다.'},
    {code:'connect_crm',title:'고객 원장은 동의 기반으로 먼저 연결해야 합니다.',body:'전화번호·주문정보를 무조건 수집하지 않고, 고객 동의와 목적 범위를 분리한 CRM 원장을 연결한 뒤 재방문·휴면 지표를 계산합니다.'},
    {code:'connect_sales',title:'POS·배달 주문은 일별 집계부터 읽기 전용으로 연결합니다.',body:'주문 원문을 한곳에 복제하기보다 일매출·주문건수·채널별 매출·메뉴군 같은 최소 집계 데이터부터 연결하는 편이 안전합니다.'},
    {code:'connect_finance',title:'매출보다 이익 신호가 늦게 연결되지 않도록 합니다.',body:'원가·배달수수료·광고비·할인비를 읽기 전용으로 연결한 뒤 매출 상승과 비용 압력을 함께 보도록 구성합니다.'}
  ];
  return[
    {code:'connect_customer',title:'에코디비즈 고객·문의 원장을 Business OS의 첫 입력으로 연결합니다.',body:'개인고객, 소상공인, 기관·단체를 한 계정으로 섞지 않고 조직·프로젝트 맥락을 유지한 고객 원장을 기준으로 삼습니다.'},
    {code:'connect_pipeline',title:'프로젝트와 매출 파이프라인을 같은 흐름으로 묶습니다.',body:'문의 → 제안 → 계약 전 검토 → 실행 → 정산 상태를 연결하되 계약 체결과 금전 확정은 계속 사람의 결정으로 남깁니다.'},
    {code:'connect_finance',title:'재무는 읽기 전용 집계부터 연결합니다.',body:'수입·비용·미수·미지급·예정 현금흐름을 Business OS가 읽어 이상 신호를 만들고, 이체·신고·계약은 자동 실행하지 않습니다.'},
    {code:'daily_report',title:'데이터가 연결되면 AI Report를 일일 운영 루프로 전환합니다.',body:'고객, 프로젝트, 마케팅, 업무, 재무를 함께 읽고 우선순위·승인 필요 항목·완료 결과를 한 보고서로 묶습니다.'}
  ];
}
function hasObservedMetrics(m={}){return [m.sales,m.salesDelta,m.customers,m.repeatRate,m.targetRepeatRate,m.openActions,m?.marketing?.inactiveCustomers,m?.marketing?.unansweredReviews,m?.operations?.overdueTasks].some(value=>Number.isFinite(Number(value)))}
function buildBrief(body={}){
  const workspace=getWorkspace(body.workspace)||WORKSPACES.ekodibiz;
  const m=body.metrics||{};
  if(!hasObservedMetrics(m))return noDataBrief(workspace);
  const marketing=m.marketing||{};const operations=m.operations||{};const finance=m.finance||{};
  const priorities=[];
  const inactive=boundedNumber(marketing.inactiveCustomers,0,100000,0);
  const reviews=boundedNumber(marketing.unansweredReviews,0,10000,0);
  const repeat=boundedNumber(m.repeatRate,0,100,0);const target=boundedNumber(m.targetRepeatRate,0,100,45);
  const delta=boundedNumber(m.salesDelta,-100,100,0);const overdue=boundedNumber(operations.overdueTasks,0,10000,0);
  if(inactive>0)priorities.push({code:'crm_reactivation',title:'재방문 고객을 먼저 깨우세요.',body:`30일 이상 미방문 고객 ${inactive}명이 있습니다. 고객군을 나누고 메시지 초안을 검토한 뒤 순차적으로 접촉하는 흐름을 권합니다.`});
  if(reviews>0)priorities.push({code:'review_response',title:'리뷰 응답 지연을 닫으세요.',body:`미응답 리뷰 ${reviews}건이 있습니다. 공개 발송 전 사람의 확인을 거치는 답변 초안부터 준비하세요.`});
  if(repeat<target)priorities.push({code:'repeat_rate',title:'신규 유입보다 재방문 전환을 보강하세요.',body:`재방문율 ${repeat}%로 목표 ${target}%보다 낮습니다. 할인 확대보다 재방문 이유와 고객군별 후속 경험을 먼저 점검하세요.`});
  if(overdue>0)priorities.push({code:'ops_overdue',title:'밀린 운영 업무를 매출 활동보다 먼저 정리할 항목과 나누세요.',body:`기한이 지난 업무 ${overdue}건이 있습니다. 고객·안전·현금흐름 관련 업무부터 우선순위를 다시 매기세요.`});
  if(delta>0&&finance.costPressure==='medium')priorities.push({code:'margin_check',title:'매출 상승을 비용과 함께 확인하세요.',body:`매출은 비교 기준 대비 ${delta}% 상승했지만 비용 압력이 있습니다. 광고비·원가·할인비를 함께 확인한 뒤 확장 여부를 결정하세요.`});
  if(!priorities.length)priorities.push({code:'observe',title:'오늘은 급한 경보보다 기본 흐름을 점검하세요.',body:'매출, 고객, 비용, 업무 지표를 확인하고 데이터 품질을 높이는 것이 다음 자동화보다 우선입니다.'});
  return priorities.slice(0,4);
}

const blockedActions=new Set(['transfer_money','sign_contract','terminate_employee','bind_insurance','deny_insurance_claim','make_hiring_decision','delete_customer_data','raise_debt','file_tax_return']);
const humanReviewActions=new Set(['send_customer_message','publish_campaign','change_ad_budget','change_price','issue_refund','submit_job_posting','share_customer_data']);
const draftOnlyActions=new Set(['draft_campaign','draft_review_reply','create_followup_task','prepare_sales_summary','segment_customers','suggest_energy_schedule','prepare_trade_quote']);
function checkAction(env,body={}){
  const cfg=runtimeConfig(env);const action=String(body.action||'').trim();const workspace=getWorkspace(body.workspace);
  if(body.workspace&&!workspace)return{decision:'blocked',reason:'unknown_workspace',executable:false,message:'등록되지 않은 워크스페이스에서는 행동을 준비하지 않습니다.'};
  if(!action)return{decision:'blocked',reason:'action_required',executable:false,message:'행동 종류가 필요합니다.'};
  if(blockedActions.has(action))return{decision:'blocked',reason:'high_impact_human_only',executable:false,message:'금전·법률·보험 확정·고용 종료 등 고영향 결정은 AI가 대신 확정할 수 없습니다.'};
  if(humanReviewActions.has(action))return{decision:'human_review',reason:'explicit_human_approval_required',executable:false,message:'외부 발송, 가격·예산 변경 등은 사람의 명시적 승인 후 별도 실행 어댑터를 통해 처리해야 합니다.'};
  if(draftOnlyActions.has(action))return{decision:'draft_only',reason:cfg.executionEnabled?'bounded_draft_capability':'execution_adapter_disabled',executable:false,message:'AI가 초안·추천·업무 준비까지 할 수 있습니다. 현재 운영면에서는 실제 외부 실행을 하지 않습니다.'};
  return{decision:'blocked',reason:'unsupported_action',executable:false,message:'등록되지 않은 행동은 기본적으로 실행하지 않습니다.'};
}

async function workspaceIndex(request,env){const assetUrl=new URL(request.url);assetUrl.pathname='/';assetUrl.search='';return withHeaders(await env.ASSETS.fetch(new Request(assetUrl.toString(),request)))}

export default{async fetch(request,env){
  const url=new URL(request.url);const cfg=runtimeConfig(env);
  if(url.pathname==='/config.js')return new Response(`window.EKODI_BUSINESS_CONFIG=${JSON.stringify(cfg)};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders()}});
  if(url.pathname==='/health')return json({ok:true,service:'ekodi-business-os',stage:cfg.mode,integrationsEnabled:cfg.integrationsEnabled,executionEnabled:cfg.executionEnabled,policy:cfg.policy,readiness:cfg.readiness,workspaces:Object.keys(WORKSPACES)});
  if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/business',307);
  if(request.method==='GET'&&url.pathname==='/api/workspaces')return json({workspaces:workspaceList(),defaultWorkspace:cfg.defaultWorkspace});
  if(request.method==='GET'&&url.pathname.startsWith('/api/workspace/')){const workspace=getWorkspace(decodeURIComponent(url.pathname.slice('/api/workspace/'.length)));return workspace?json({workspace,metrics:{sales:null,salesDelta:null,customers:null,newCustomers:null,repeatRate:null,targetRepeatRate:null,openActions:null,pendingApprovals:null},dataState:workspace.dataState,dataMessage:workspace.dataMessage}):json({error:'workspace_not_found'},404)}
  if(request.method==='POST'&&url.pathname==='/api/brief'){let body={};try{body=await request.json()}catch{return json({error:'invalid_json'},400)}const workspace=getWorkspace(body.workspace)||WORKSPACES.ekodibiz;return json({mode:hasObservedMetrics(body.metrics||{})?'explainable-rule-mvp':'connection-readiness',workspace:workspace.id,sampleSafe:true,priorities:buildBrief(body)});}
  if(request.method==='POST'&&url.pathname==='/api/action-check'){let body={};try{body=await request.json()}catch{return json({error:'invalid_json'},400)}return json({policy:cfg.policy,...checkAction(env,body)});}
  if(url.pathname.startsWith('/api/'))return json({error:'not_found'},404);
  if(request.method==='GET'&&getWorkspace(url.pathname.replace(/^\/+|\/+$/g,'')))return workspaceIndex(request,env);
  return withHeaders(await env.ASSETS.fetch(request));
}};