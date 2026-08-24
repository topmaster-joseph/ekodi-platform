const DART_COMPANY_URL='https://opendart.fss.or.kr/api/company.json';
const DART_PUBLIC_URL='https://opendart.fss.or.kr/';
const CONNECTION_DOCS=Object.freeze({
  opendart:'https://opendart.fss.or.kr/uss/umt/EgovMberInsertView.do',
  fsc_public_data:'https://www.data.go.kr/',
  krx:'https://openapi.krx.co.kr/',
  financial_mydata:'https://www.mydatacenter.or.kr/',
});
const clean=(value,max=500)=>String(value??'').trim().slice(0,max);
const has=value=>Boolean(clean(value,4096));
const nowIso=()=>new Date().toISOString();
const evidence=(fieldPath,value,sourceName,sourceUrl,sourceRecordId)=>({fieldPath,value,sourceClass:'official',sourceName,sourceUrl,sourceRecordId,observedAt:nowIso(),confidence:1});

export function officialDataConnections(env={}){
  const dartKey=has(env.OPENDART_API_KEY);
  const publicKey=has(env.DATA_GO_KR_SERVICE_KEY);
  const publicEndpoint=has(env.FSC_COMPANY_API_URL_TEMPLATE);
  const krxKey=has(env.KRX_OPENAPI_KEY);
  const krxEndpoint=has(env.KRX_OPENAPI_URL_TEMPLATE);
  const mydataPartner=has(env.FINANCIAL_DATA_PARTNER_URL)&&has(env.FINANCIAL_DATA_PARTNER_TOKEN);
  return [
    {id:'opendart',name:'금융감독원 OpenDART',status:dartKey?'ready':'approval_required',required:dartKey?[]:['OPENDART_API_KEY'],scope:'기업개황·공시·재무 공식근거',docs:CONNECTION_DOCS.opendart},
    {id:'fsc_public_data',name:'금융위원회 공공데이터',status:publicKey&&publicEndpoint?'ready':publicKey?'endpoint_configuration_required':'approval_required',required:[...(!publicKey?['DATA_GO_KR_SERVICE_KEY']:[]),...(!publicEndpoint?['FSC_COMPANY_API_URL_TEMPLATE']:[])],scope:'기업·금융 공공데이터',docs:CONNECTION_DOCS.fsc_public_data},
    {id:'krx',name:'KRX OPEN API',status:krxKey&&krxEndpoint?'ready':krxKey?'endpoint_and_license_configuration_required':'license_and_key_required',required:[...(!krxKey?['KRX_OPENAPI_KEY']:[]),...(!krxEndpoint?['KRX_OPENAPI_URL_TEMPLATE']:[])],scope:'시장·종목·거래소 데이터',docs:CONNECTION_DOCS.krx},
    {id:'financial_mydata',name:'금융 마이데이터 파트너',status:mydataPartner?'partner_ready':'licensed_partner_required',required:mydataPartner?[]:['FINANCIAL_DATA_PARTNER_URL','FINANCIAL_DATA_PARTNER_TOKEN'],scope:'사용자 동의 기반 실제 금융자산',docs:CONNECTION_DOCS.financial_mydata},
  ];
}

function dartCorpCode(value=''){
  const raw=clean(value,120).replace(/^dart:/i,'').replace(/^corp:/i,'');
  return /^\d{8}$/.test(raw)?raw:'';
}

async function fetchDartCompany(env,payload){
  const connection=officialDataConnections(env).find(item=>item.id==='opendart');
  if(connection.status!=='ready')return {provider:'opendart',status:connection.status,evidence:[]};
  if(!['business','organization','project'].includes(payload.entityType))return {provider:'opendart',status:'not_applicable',evidence:[]};
  const corpCode=dartCorpCode(payload.publicIdentifier);
  if(!corpCode)return {provider:'opendart',status:'official_identifier_required',requiredIdentifier:'DART 8-digit corp_code',evidence:[]};
  const url=new URL(DART_COMPANY_URL);
  url.searchParams.set('crtfc_key',String(env.OPENDART_API_KEY));
  url.searchParams.set('corp_code',corpCode);
  let response;
  try{response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(6000)})}catch{return {provider:'opendart',status:'temporarily_unavailable',evidence:[]}}
  if(!response.ok)return {provider:'opendart',status:'upstream_error',evidence:[]};
  const data=await response.json().catch(()=>null);
  if(!data||String(data.status)!=='000')return {provider:'opendart',status:'record_not_available',upstreamStatus:clean(data?.status,20),evidence:[]};
  const rows=[];
  const add=(path,value)=>{const normalized=clean(value,2000);if(normalized)rows.push(evidence(path,normalized,'금융감독원 OpenDART',DART_PUBLIC_URL,corpCode))};
  add('identity.officialName',data.corp_name);
  add('identity.englishName',data.corp_name_eng);
  add('identity.stockName',data.stock_name);
  add('identity.stockCode',data.stock_code);
  add('identity.ceoName',data.ceo_nm);
  add('identity.corporationRegistrationNumber',data.jurir_no);
  add('identity.businessRegistrationNumber',data.bizr_no);
  add('identity.address',data.adres);
  add('identity.homepage',data.hm_url);
  add('identity.irHomepage',data.ir_url);
  add('identity.phone',data.phn_no);
  add('identity.fax',data.fax_no);
  add('identity.industryCode',data.induty_code);
  add('identity.establishedDate',data.est_dt);
  add('identity.accountingMonth',data.acc_mt);
  add('identity.dartCorpCode',data.corp_code||corpCode);
  return {provider:'opendart',status:'complete',evidence:rows};
}

function providerSummary(env){
  return officialDataConnections(env).map(({id,name,status,required,scope,docs})=>({id,name,status,required,scope,docs}));
}

export function createOfficialProfileDataBinding(env={}){
  return {
    async fetch(input,init={}){
      const request=input instanceof Request?input:new Request(String(input),init);
      const url=new URL(request.url);
      if(request.method==='GET'&&url.pathname==='/health')return Response.json({service:'ekodi-official-profile-data',providers:providerSummary(env),secretsExposed:false});
      if(request.method!=='POST'||url.pathname!=='/profile/discover')return Response.json({error:'NOT_FOUND'},{status:404});
      const payload=await request.json().catch(()=>null);
      if(!payload||!payload.entityType)return Response.json({error:'INVALID_PAYLOAD'},{status:400});
      if(payload.entityType==='person'){
        return Response.json({evidence:[],providers:providerSummary(env),policy:{personalExternalDiscovery:false,financialDataRequiresConsentAndLicensedPartner:true}});
      }
      const dart=await fetchDartCompany(env,payload);
      return Response.json({evidence:dart.evidence||[],providers:providerSummary(env),runs:[dart],policy:{officialOnly:true,unknownFactsStayUnknown:true,noSecretInEvidence:true}});
    },
  };
}
