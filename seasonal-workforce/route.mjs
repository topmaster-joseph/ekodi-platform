import {PUBLIC_PAGES,publicHeader,SITE_BASE} from './public-pages.mjs';
import {portalCss,portalClientScript} from './public-assets.mjs';
import {municipalOfficeHtml,municipalOfficeScript} from './office-surface.mjs';
// EKODI Biz Seasonal Workforce demonstration surface: explicitly NO submissions.
// Canonical apex routing; no separate login, database, personal-data collection or server writes.
export const SEASONAL_PORTAL_ROOT='/ekodibiz/seasonal-workers';
const homepage=PUBLIC_PAGES['/'];
const surveyPage="<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>농가 수요조사 · 시연 | EKODI</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#172d27;background:#f5f7f5;margin:0}main{max-width:750px;margin:35px auto;padding:25px;background:white;border:1px solid #ddd;border-radius:12px}h1{font-size:28px}label{display:block;margin:18px 0 5px;font-weight:650}input,select{width:100%;padding:12px;border:1px solid #9aa9a1;border-radius:6px;font:inherit;box-sizing:border-box}button{background:#145941;color:white;border:0;padding:12px 18px;border-radius:6px;font:inherit;margin-top:20px;cursor:pointer}.note{padding:15px;background:#edf4ee;border-left:4px solid #18754d}output{display:block;white-space:pre-wrap;margin-top:20px}a{color:#145941}@media print{button,.note,a{display:none}main{border:0;margin:0}}</style></head><body><main><a href=\"./\">← 사업 소개</a><h1>농가 인력 수요조사 · 시연 양식</h1><p class=\"note\">이 화면은 기능 시연용입니다. 서버로 전송되지 않으며 저장되지 않습니다. 농가명, 성명, 연락처, 주소 등 개인정보는 입력하지 마십시오. 실제 신청·접수가 아닙니다.</p><form id=\"survey\"><label for=\"crop\">작목</label><select id=\"crop\" required><option value=\"\">선택</option><option>양파</option><option>마늘</option><option>고구마</option><option>시설원예</option><option>기타</option></select><label for=\"workers\">필요 인원(명)</label><input id=\"workers\" type=\"number\" min=\"1\" max=\"1000\" step=\"1\" required><label for=\"start\">희망 시작월</label><input id=\"start\" type=\"month\" required><label for=\"months\">희망 근무기간(개월)</label><select id=\"months\" required><option value=\"\">선택</option><option value=\"1\">1</option><option value=\"2\">2</option><option value=\"3\">3</option><option value=\"4\">4</option><option value=\"5\">5</option><option value=\"6\">6</option><option value=\"7\">7</option><option value=\"8\">8</option></select><label for=\"housing\">숙소 준비 상태</label><select id=\"housing\" required><option value=\"\">선택</option><option>준비 완료</option><option>준비 중</option><option>추가 지원 필요</option></select><button type=\"submit\">시연 결과 보기</button> <button type=\"button\" id=\"print\" disabled>결과 인쇄</button></form><output id=\"result\" aria-live=\"polite\"></output></main><script defer src=\"./survey-demo.js\"></script></body></html>";
const surveyScript="const form=document.getElementById('survey'),result=document.getElementById('result'),print=document.getElementById('print');form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;const workers=Number(document.getElementById('workers').value),months=Number(document.getElementById('months').value);if(!Number.isSafeInteger(workers)||workers<1||workers>1000)return;result.textContent='[시연 결과 · 공식 접수 아님]\\n작목: '+document.getElementById('crop').value+'\\n필요 인원: '+workers+'명\\n희망 시작월: '+document.getElementById('start').value+'\\n희망 기간: '+months+'개월\\n숙소: '+document.getElementById('housing').value+'\\n예상 인력 수요: '+(workers*months)+'인·개월\\n\\n※ 인력 배정이나 체류기간 승인을 의미하지 않습니다.';print.disabled=false});print.addEventListener('click',()=>window.print());";
const hdr={
 'cache-control':'no-store, max-age=0',
 'x-content-type-options':'nosniff',
 'x-robots-tag':'noindex, nofollow, noarchive',
 'referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'"
};
export function isSeasonalPortalPath(path) {
 return path===SEASONAL_PORTAL_ROOT || path.startsWith(SEASONAL_PORTAL_ROOT+'/');
}
export function seasonalPortalResponse(request) {
 const url=new URL(request.url),path=url.pathname;
 if(!isSeasonalPortalPath(path))return null;
 if(url.hostname!=='ekodi.kr'||url.protocol!=='https:')return new Response('Forbidden',{status:403,headers:hdr});
 if(path===SEASONAL_PORTAL_ROOT&&['GET','HEAD'].includes(request.method))return new Response(null,{status:308,headers:{...hdr,location:SEASONAL_PORTAL_ROOT+'/'+url.search}});
 if(path.startsWith(SEASONAL_PORTAL_ROOT+'/api/'))return new Response(JSON.stringify({ok:false,error:'applications_not_enabled'}),{status:503,headers:{...hdr,'content-type':'application/json; charset=utf-8','allow':'GET, HEAD'}});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{...hdr,allow:'GET, HEAD'}});
 const suffix=path.slice(SEASONAL_PORTAL_ROOT.length);
const surveyStyled=surveyPage
 .replace('</head>','<link rel="stylesheet" href="'+SITE_BASE+'/theme.css"></head>')
 .replace('<body><main>','<body class="swp-legacy">'+publicHeader('/demand')+'<main>');
const officePage=municipalOfficeHtml
 .replace('</head>','<link rel="stylesheet" href="'+SITE_BASE+'/theme.css"></head>')
 .replace('<body><main','<body class="swp-office">'+publicHeader('/office')+'<main')
 .replace(/<header class="top">[\s\S]*?<\/header>/,'')
 .replace('<h1>기관별 운영공간</h1>','<section class="swp-office-banner"><span class="swp-eyebrow">MUNICIPAL OPERATIONS · RESTRICTED</span><h1>기관별 운영공간</h1><p>행정 수요 관리와 기관별 접근권한을 함께 확인합니다. 이 화면은 제안용 시안입니다. 공식 권한 등록 이전에는 저장 기능이 비활성화됩니다.</p></section>');
const publicExtra=Object.fromEntries(Object.entries(PUBLIC_PAGES).filter(([path])=>path!=='/').map(([path,html])=>[path,[html,'text/html; charset=utf-8']]));
 const types={'/': [homepage,'text/html; charset=utf-8'],
 '/survey-demo':[surveyStyled,'text/html; charset=utf-8'],
 '/survey-demo.js':[surveyScript,'text/javascript; charset=utf-8'],
 '/office':[officePage,'text/html; charset=utf-8'],
 '/office.js':[municipalOfficeScript,'text/javascript; charset=utf-8'],
 '/theme.css':[portalCss,'text/css; charset=utf-8'],
 '/public.js':[portalClientScript,'text/javascript; charset=utf-8'],
 ...publicExtra};
 const page=types[suffix];
 if(!page)return new Response('Not Found',{status:404,headers:hdr});
 const pageHeaders=suffix==='/office'||suffix==='/office.js'?{...hdr,'content-security-policy':hdr['content-security-policy'].replace("connect-src 'none'","connect-src 'self'")}:hdr;
 return new Response(request.method==='HEAD'?null:page[0],{status:200,headers:{...pageHeaders,'content-type':page[1]}});
}
