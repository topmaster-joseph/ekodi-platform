function securityHeaders(){return{'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...securityHeaders()}})}
function withHeaders(response){const headers=new Headers(response.headers);for(const [key,value]of Object.entries(securityHeaders()))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
function boundedNumber(value,min,max,fallback=0){const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
function runtimeConfig(env={}){return{mode:env.BUSINESS_MODE||'isolated-staging',integrationsEnabled:env.INTEGRATIONS_ENABLED==='true',executionEnabled:env.EXECUTION_ENABLED==='true',readiness:boundedNumber(env.READINESS,0,100,62),authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=business',policy:'observe-discern-suggest-approve-act-verify-report'}}

function buildBrief(body={}){
  const m=body.metrics||{};
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
  const cfg=runtimeConfig(env);const action=String(body.action||'').trim();
  if(!action)return{decision:'blocked',reason:'action_required',executable:false,message:'행동 종류가 필요합니다.'};
  if(blockedActions.has(action))return{decision:'blocked',reason:'high_impact_human_only',executable:false,message:'금전·법률·보험 확정·고용 종료 등 고영향 결정은 AI가 대신 확정할 수 없습니다.'};
  if(humanReviewActions.has(action))return{decision:'human_review',reason:'explicit_human_approval_required',executable:false,message:'외부 발송, 가격·예산 변경 등은 사람의 명시적 승인 후 별도 실행 어댑터를 통해 처리해야 합니다.'};
  if(draftOnlyActions.has(action))return{decision:'draft_only',reason:cfg.executionEnabled?'bounded_draft_capability':'execution_adapter_disabled',executable:false,message:'AI가 초안·추천·업무 준비까지 할 수 있습니다. 현재 MVP에서는 실제 외부 실행을 하지 않습니다.'};
  return{decision:'blocked',reason:'unsupported_action',executable:false,message:'등록되지 않은 행동은 기본적으로 실행하지 않습니다.'};
}

export default{async fetch(request,env){
  const url=new URL(request.url);const cfg=runtimeConfig(env);
  if(url.pathname==='/config.js')return new Response(`window.EKODI_BUSINESS_CONFIG=${JSON.stringify(cfg)};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders()}});
  if(url.pathname==='/health')return json({ok:true,service:'ekodi-business-os',stage:cfg.mode,integrationsEnabled:cfg.integrationsEnabled,executionEnabled:cfg.executionEnabled,policy:cfg.policy,readiness:cfg.readiness});
  if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/business',307);
  if(request.method==='POST'&&url.pathname==='/api/brief'){let body={};try{body=await request.json()}catch{return json({error:'invalid_json'},400)}return json({mode:'explainable-rule-mvp',sampleSafe:true,priorities:buildBrief(body)});}
  if(request.method==='POST'&&url.pathname==='/api/action-check'){let body={};try{body=await request.json()}catch{return json({error:'invalid_json'},400)}return json({policy:cfg.policy,...checkAction(env,body)});}
  if(url.pathname.startsWith('/api/'))return json({error:'not_found'},404);
  return withHeaders(await env.ASSETS.fetch(request));
}};
