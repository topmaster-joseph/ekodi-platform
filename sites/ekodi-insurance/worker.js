const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://ekodi-insurance-api-staging.ekodi-development.workers.dev https://ekodi-insurance-api-green.topmaster-joseph.workers.dev https://insurance-api.ekodi.kr; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};
const CAR_GUIDE_META={
  ko:{title:'자동차보험 간단 안내 | EKODI Insurance',description:'책임보험과 긴급출동서비스 등 자동차보험의 기본 개념을 쉽고 짧게 설명하는 EKODI Insurance 공용 다국어 안내입니다.'},
  en:{title:'Simple Car Insurance Guide | EKODI Insurance',description:'A short public guide to liability insurance and emergency roadside service for drivers in Korea.'},
  'zh-CN':{title:'汽车保险简明指南 | EKODI Insurance',description:'面向在韩国驾驶者的汽车责任保险和紧急道路救援服务公共简明指南。'},
  vi:{title:'Hướng dẫn ngắn về bảo hiểm ô tô | EKODI Insurance',description:'Hướng dẫn công khai, ngắn gọn về bảo hiểm trách nhiệm và dịch vụ cứu hộ khẩn cấp dành cho người lái xe tại Hàn Quốc.'}
};
const DETAIL_ALIASES=new Map([
  ['/insurance/car','auto'],['/insurance/car/','auto'],['/car','auto'],['/car/','auto'],
  ['/insurance/car/liability','auto'],['/insurance/car/liability/','auto'],
  ['/insurance/medical','medical'],['/insurance/medical/','medical'],
  ['/insurance/health','health'],['/insurance/health/','health'],
  ['/insurance/accident','accident'],['/insurance/accident/','accident'],
  ['/insurance/life','life'],['/insurance/life/','life'],
  ['/insurance/driver','driver'],['/insurance/driver/','driver'],
  ['/insurance/property','property'],['/insurance/property/','property'],
  ['/insurance/liability','liability'],['/insurance/liability/','liability'],
  ['/insurance/travel','travel'],['/insurance/travel/','travel'],
  ['/insurance/pension','savings'],['/insurance/pension/','savings'],
]);
function isProduction(env){return String(env?.ENVIRONMENT||'staging').toLowerCase()==='production';}
function withHeaders(response){const headers=new Headers(response.headers);for(const [k,v] of Object.entries(SECURITY_HEADERS))headers.set(k,v);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-store':'public, max-age=300');return headers;}
function truthfulHtml(html,production=false){let output=html.replace('STAGING · LOCAL ONLY','STAGING · PRIVACY FIRST').replace('현재 스테이징은 민감정보를 서버로 전송하지 않습니다. 입력 내용은 이 브라우저에만 임시 저장되며 언제든 전체 삭제할 수 있습니다.','보험목록·청구 메모·기본 AI 대화는 이 브라우저에 보관합니다. 실제 설계사 상담을 요청할 때만 이름과 연락처를 암호화해 전송하며, AI 대화 원문 공유는 별도로 선택할 수 있습니다.').replace('이 스테이징 버전에서는 입력한 보험·청구·상담 정보가 EKODI 서버나 외부 분석서비스로 전송되지 않습니다. 현재 브라우저의 저장공간에만 임시 보관됩니다.','보험목록·청구 준비기록·AI 대화는 이 브라우저에 보관합니다. 설계사 상담을 요청하면 이름과 연락처만 필수동의 후 암호화해 상담대기열에 저장하며, AI 대화 원문은 별도 선택동의가 있을 때만 암호화해 공유합니다.').replace('현재 단계에서는 실제 담당자에게 전송되지 않고 이 브라우저에만 임시 저장됩니다.','설계사 상담 요청 시 이름과 연락처를 암호화해 상담대기열에 저장합니다. AI 대화 원문 공유는 별도 선택사항입니다.').replace('스테이징에서는 외부 전송되지 않습니다.','설계사 상담 요청 시 암호화 저장됩니다.');if(production){output=output.replaceAll('STAGING · PRIVACY FIRST','PRIVACY FIRST').replaceAll('STAGING · LOCAL ONLY','PRIVACY FIRST').replaceAll('현재 스테이징','현재 서비스').replaceAll('이 스테이징 버전','현재 서비스');}return output;}
async function secureAsset(response,production=false,{injectBridge=true,injectKnowledge=false}={}){const headers=withHeaders(response);if(response.headers.get('content-type')?.includes('text/html')){let html=truthfulHtml(await response.text(),production);if(injectKnowledge&&!html.includes('/insurance-knowledge.css'))html=html.replace('</head>','  <link rel="stylesheet" href="/insurance-knowledge.css" />\n  <script src="/insurance-knowledge.js" defer></script>\n</head>');if(injectBridge&&!html.includes('/server-bridge.js'))html=html.replace('</head>','  <script src="/server-bridge.js" defer></script>\n</head>');headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');return new Response(html,{status:response.status,statusText:response.statusText,headers});}return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
async function fetchAsset(request,env,pathname){if(!pathname)return env.ASSETS.fetch(request);const target=new URL(request.url);target.pathname=pathname;target.search='';return env.ASSETS.fetch(new Request(target.toString(),request));}
function htmlEscape(value){return String(value).replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
function supportedGuideLanguage(value){const normalized=String(value||'').toLowerCase();if(normalized==='ko')return 'ko';if(normalized==='en')return 'en';if(normalized==='zh'||normalized==='zh-cn')return 'zh-CN';if(normalized==='vi')return 'vi';return null;}
function preferredGuideLanguage(request){const accepted=String(request.headers.get('accept-language')||'').toLowerCase();if(accepted.includes('zh'))return 'zh-CN';if(accepted.includes('vi'))return 'vi';if(accepted.includes('en'))return 'en';return 'ko';}
async function carGuideResponse(request,env,production,url,lang){const meta=CAR_GUIDE_META[lang];const canonical=`${url.origin}/guide/car-insurance/${lang}`;const asset=await fetchAsset(request,env,'/car-insurance-guide.html');const headers=new Headers(asset.headers);headers.set('content-language',lang);headers.delete('content-length');headers.delete('etag');const html=(await asset.text()).replaceAll('__LANG__',htmlEscape(lang)).replaceAll('__TITLE__',htmlEscape(meta.title)).replaceAll('__DESCRIPTION__',htmlEscape(meta.description)).replaceAll('__URL__',htmlEscape(canonical));return secureAsset(new Response(html,{status:asset.status,statusText:asset.statusText,headers}),production,{injectBridge:false});}
export default {async fetch(request,env){const url=new URL(request.url);const production=isProduction(env);
  if(url.pathname==='/health')return new Response(JSON.stringify({ok:true,service:'ekodi-insurance',environment:production?'production':'staging',mode:production?'production-cloudflare-d1-free':'staging-cloudflare-d1-free',publicRole:'insurance-knowledge-and-advisor-connection',personalInsuranceCare:'my-ekodi',personalInsurancePath:'https://ekodi.kr/my/insurance/',consultationStorage:'encrypted-d1-on-explicit-handoff',privacyCenter:true,productRecommendation:false,insuranceKnowledgeHub:true,lawSourceManifest:true,multilingualCarGuide:true,publicMultilingualCarGuide:true,advisorGuideCanonicalRedirect:true,aiChat:true,humanHandoffQueue:true,adminQueue:true,externalAiProvider:false}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
  if(url.pathname==='/'||url.pathname==='/index.html'||url.pathname==='/insurance'||url.pathname==='/insurance/')return secureAsset(await fetchAsset(request,env,'/insurance-home.html'),production,{injectBridge:false});
  const alias=DETAIL_ALIASES.get(url.pathname);if(alias)return Response.redirect(`${url.origin}/guide/insurance/${alias}`,302);
  if(['/guide/car-insurance','/guide/car-insurance/'].includes(url.pathname)){const lang=preferredGuideLanguage(request);return Response.redirect(`${url.origin}/guide/car-insurance/${lang}`,302);}
  if(['/advisor/guide/car-insurance','/advisor/guide/car-insurance/'].includes(url.pathname)){const lang=preferredGuideLanguage(request);return Response.redirect(`${url.origin}/guide/car-insurance/${lang}`,302);}
  const advisorGuideMatch=url.pathname.match(/^\/advisor\/guide\/car-insurance\/([^/]+)\/?$/i);
  if(advisorGuideMatch){const lang=supportedGuideLanguage(advisorGuideMatch[1])||'ko';return Response.redirect(`${url.origin}/guide/car-insurance/${lang}`,302);}
  const carGuideMatch=url.pathname.match(/^\/guide\/car-insurance\/([^/]+)\/?$/i);
  if(carGuideMatch){const lang=supportedGuideLanguage(carGuideMatch[1]);if(!lang)return Response.redirect(`${url.origin}/guide/car-insurance/ko`,302);if(carGuideMatch[1]!==lang)return Response.redirect(`${url.origin}/guide/car-insurance/${lang}`,302);return carGuideResponse(request,env,production,url,lang);}
  if(/^\/guide\/insurance\/[^/]+\/?$/i.test(url.pathname))return secureAsset(await fetchAsset(request,env,'/insurance-detail.html'),production,{injectBridge:false});
  const advisorCanonical=url.pathname.match(/^\/insurance\/advisors\/([^/]+)\/?$/i);if(advisorCanonical)return secureAsset(await fetchAsset(request,env,'/advisor.html'),production);
  if(url.pathname==='/advisor'||url.pathname==='/advisor/')return secureAsset(await fetchAsset(request,env,'/advisor.html'),production);
  if(url.pathname==='/admin'||url.pathname==='/admin/'){if(production)return Response.redirect('https://admin.ekodi.kr/',302);return secureAsset(await fetchAsset(request,env,'/admin.html'),false);}
  return secureAsset(await fetchAsset(request,env),production,{injectBridge:false});
}};