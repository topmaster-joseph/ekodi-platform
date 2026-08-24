export const MONEY_CONSENT_VERSION='2026-08-24.v1';

export const MONEY_PROVIDERS=Object.freeze([
  Object.freeze({
    id:'accountinfo',
    name:'금융결제원 어카운트인포',
    mode:'official-handoff',
    state:'available',
    liveAccess:false,
    contractRequired:false,
    oauth:false,
    officialUrl:'https://www.payinfo.or.kr/main/main.do',
    capabilities:['account-discovery','card-discovery','insurance-discovery','autopay-review','eligible-account-closure','eligible-balance-transfer'],
    execution:'official-site-only',
    note:'EKODI가 금융정보를 수집하지 않고 사용자가 공인 금융결제원 화면에서 직접 조회·실행합니다.'
  }),
  Object.freeze({
    id:'kftc-openbanking',
    name:'금융결제원 오픈뱅킹',
    mode:'oauth-api',
    state:'contract-required',
    liveAccess:false,
    contractRequired:true,
    oauth:true,
    officialUrl:'https://openapi.kftc.or.kr/service/openBanking',
    capabilities:['balance-inquiry','transaction-history','account-holder-check','cards','insurance','loans','deposit-transfer','withdrawal-transfer'],
    execution:'disabled-until-contract-and-human-gate',
    note:'이용기관 신청·계약과 사용자 OAuth 인증/동의가 완료된 뒤 서버측 어댑터를 활성화합니다.'
  }),
  Object.freeze({
    id:'financial-mydata',
    name:'금융 마이데이터',
    mode:'regulated-api',
    state:'legal-review',
    liveAccess:false,
    contractRequired:true,
    oauth:true,
    officialUrl:'https://www.fsc.go.kr/',
    capabilities:['portfolio-aggregation','financial-relationship-analysis'],
    execution:'analysis-only-until-reviewed',
    note:'허가·제휴·위탁 등 적용 가능한 법적 지위와 데이터 처리 범위를 먼저 확정해야 합니다.'
  })
]);

const ALLOWED_SCOPES=new Set([
  'accounts:read',
  'balances:read',
  'transactions:read',
  'cards:read',
  'insurance:read',
  'loans:read',
  'autopay:read'
]);

export function providerFor(id){return MONEY_PROVIDERS.find(provider=>provider.id===String(id||''))||null;}

export function normalizeScopes(scopes=[]){
  return [...new Set((Array.isArray(scopes)?scopes:[]).map(value=>String(value||'').trim()).filter(scope=>ALLOWED_SCOPES.has(scope)))];
}

export function buildConsentPreview(providerId,scopes=[]){
  const provider=providerFor(providerId);
  if(!provider)return {ok:false,error:'provider_not_found'};
  const normalized=normalizeScopes(scopes);
  return {
    ok:true,
    provider:{id:provider.id,name:provider.name,state:provider.state,liveAccess:provider.liveAccess},
    consentVersion:MONEY_CONSENT_VERSION,
    scopes:normalized,
    purpose:'금융관계 정리와 유지·검토·정리 순서 제안',
    collection:'최소수집 원칙. 계약 전에는 실제 금융 API 데이터나 인증토큰을 수집하지 않습니다.',
    retention:'V2 준비단계에서는 금융 연결정보를 영구 저장하지 않습니다.',
    execution:'조회 동의와 자금이동·해지·자동이체 변경 승인은 분리합니다.',
    revocable:true,
    humanGateRequired:true
  };
}

export function buildIntegrationReadiness(env={}){
  const openBankingConfigured=env.KFTC_OPENBANKING_ENABLED==='true'&&Boolean(env.KFTC_OPENBANKING_CLIENT_ID)&&Boolean(env.KFTC_OPENBANKING_REDIRECT_URI)&&env.OAUTH_STATE_STORE_READY==='true';
  return {
    version:2,
    stage:'integration-readiness',
    providers:MONEY_PROVIDERS.map(provider=>({
      ...provider,
      liveAccess:provider.id==='kftc-openbanking'?openBankingConfigured:false,
      state:provider.id==='kftc-openbanking'&&openBankingConfigured?'configured-awaiting-approval':provider.state
    })),
    openBankingConfigured,
    oauthStateStoreReady:env.OAUTH_STATE_STORE_READY==='true',
    financialExecution:false,
    autonomousFinancialExecution:false,
    sensitiveCredentialCollection:false
  };
}

export function securityEvent(type,detail={}){
  const safeProvider=String(detail.providerId||'').slice(0,64);
  const safeAction=String(detail.action||'').slice(0,64);
  const scopeCount=Array.isArray(detail.scopes)?detail.scopes.length:Number(detail.scopeCount)||0;
  return {
    event:'ekodi.money.security',
    type:String(type||'unknown').slice(0,80),
    providerId:safeProvider,
    action:safeAction,
    scopeCount,
    at:new Date().toISOString()
  };
}
