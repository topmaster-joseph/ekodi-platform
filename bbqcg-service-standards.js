// BBQ Muan Cheonggye service promise — public, read-only, customer-owned.
// Separate from Genesis BBQ training/recipe material and platform branding.
// The operator checklist lives in the accompanying local operations runbook.
const GROUPS = Object.freeze([
  {key:'quality',name:'품질',en:'QUALITY',intro:'고객이 선택한 메뉴를 정확하고 일관되게 제공합니다.',items:['공식 메뉴·가격·판매 여부를 주문 화면과 대조','주문 요청과 포장 내용을 최종 확인','품질·보관·조리 절차는 본사의 최신 승인 지침에 따름']},
  {key:'cleanliness',name:'청결',en:'CLEANLINESS',intro:'고객과 직원 모두가 안심하는 공간을 지향합니다.',items:['개점·영업 중·마감 위생 점검','매장 설비·작업 공간 상태 확인','이상 발견 시 즉시 기록하고 운영자가 조치']},
  {key:'service',name:'서비스',en:'SERVICE',intro:'고객의 시간을 존중하고 약속을 지킵니다.',items:['전화·온라인 문의를 정확히 안내','배달·포장 가능 여부와 예상 상황을 사실대로 설명','불편 접수 시 책임자에게 전달하고 해결 확인']}
]);
const esc = value => String(value??'').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
export function bbqcgServiceStandardsCss(){
  return new Response(`
:root{color-scheme:light;--red:#bd1732;--red-deep:#99142b;--navy:#15183d;--ink:#20233b;--muted:#515a70;--paper:#fffaf4;--line:#e8e2dd;--gold:#eac78a}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:90px}
body.bbqcg-service-page{margin:0!important;background:var(--paper)!important;color:var(--ink)!important;font:16px/1.7 system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif!important;word-break:keep-all;-webkit-font-smoothing:antialiased}
body.bbqcg-service-page a{color:inherit;text-decoration:none}body.bbqcg-service-page a:focus-visible{outline:3px solid #bd1732;outline-offset:4px;border-radius:6px}
body.bbqcg-service-page .skip{position:absolute;left:-9999px;top:auto}body.bbqcg-service-page .skip:focus{left:14px;top:14px;z-index:100;background:#fff;color:var(--ink);padding:11px 16px}
body.bbqcg-service-page .shell{width:min(1300px,calc(100% - 48px));margin-inline:auto;min-width:0}
body.bbqcg-service-page .promise-header{background:#fff!important;border-bottom:3px solid var(--gold)!important}
body.bbqcg-service-page .head{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:82px;padding:12px 0}
body.bbqcg-service-page .promise-brand{display:flex;align-items:center;gap:16px;min-width:0}
body.bbqcg-service-page .promise-mark{font:900 34px/1 Arial,sans-serif;letter-spacing:-.08em;color:var(--red)!important}
body.bbqcg-service-page .promise-brand strong{display:block;color:var(--navy)!important;font-weight:850;font-size:20px;line-height:1.4;letter-spacing:-.035em}
body.bbqcg-service-page .promise-brand small{display:block;color:#5b6474!important;font-size:11px;font-weight:650;letter-spacing:.01em}
body.bbqcg-service-page .home-link{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:44px;padding:9px 18px;border:1px solid #e8d7d9;border-radius:999px;font-size:13px;color:var(--red-deep)!important;font-weight:800;white-space:nowrap;background:#fff9f8}
body.bbqcg-service-page .home-link:hover{background:#fff0f1}
body.bbqcg-service-page main#main{padding:34px 0 64px!important;background:transparent!important;color:var(--ink)!important}
body.bbqcg-service-page .promise-hero{position:relative;isolation:isolate;overflow:hidden;border-radius:24px;background:linear-gradient(115deg,#171942 0%,#10142d 67%,#31223d 100%)!important;padding:clamp(30px,5vw,66px);box-shadow:0 18px 46px #15183d1c;color:#fff!important}
body.bbqcg-service-page .promise-hero:after{content:"";position:absolute;width:270px;height:270px;border:1px solid #f4cc8f63;border-radius:50%;right:-55px;top:-95px;z-index:-1;box-shadow:0 0 0 45px #f4cc8f09,0 0 0 105px #f4cc8f05}
body.bbqcg-service-page .eyebrow{margin:0 0 10px;color:var(--red)!important;font-size:11px;letter-spacing:.14em;font-weight:900}
body.bbqcg-service-page .promise-hero .eyebrow{color:#f2c887!important}
body.bbqcg-service-page h1{margin:0;max-width:850px;font-size:clamp(30px,4vw,52px);font-weight:900;letter-spacing:-.055em;line-height:1.28;color:#fff!important;text-wrap:balance}
body.bbqcg-service-page .lead{max-width:720px;margin:18px 0 0;color:#eef0f8!important;font-size:clamp(14px,1.5vw,17px);line-height:1.9}
body.bbqcg-service-page .standards-section{margin-top:46px}
body.bbqcg-service-page .section-head{margin-bottom:18px}
body.bbqcg-service-page .section-head h2,body.bbqcg-service-page .downloads>h2{font-size:clamp(23px,2.6vw,32px);line-height:1.4;margin:0;color:var(--navy)!important;letter-spacing:-.04em;font-weight:900}
body.bbqcg-service-page .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:0}
body.bbqcg-service-page .promise-card{background:#fff!important;color:var(--ink)!important;padding:clamp(21px,2.6vw,30px);border:1px solid var(--line);border-radius:20px;min-width:0;box-shadow:0 9px 26px #1a1a3c0a}
body.bbqcg-service-page .card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
body.bbqcg-service-page .tag{color:var(--red-deep)!important;font-size:11px;letter-spacing:.12em;font-weight:900}
body.bbqcg-service-page .card-num{font-size:23px;line-height:1;font-weight:800;letter-spacing:-.04em;color:#c2a179!important}
body.bbqcg-service-page .promise-card h2{margin:14px 0 9px;color:var(--navy)!important;font-weight:900;font-size:clamp(23px,2vw,28px);letter-spacing:-.04em}
body.bbqcg-service-page .promise-card p{margin:0;color:#3b4258!important;line-height:1.75;font-size:15px}
body.bbqcg-service-page .promise-card ul{margin:21px 0 0;padding:18px 0 0 19px;border-top:1px solid #eae6e2;color:#354057!important;font-size:14px;line-height:1.7}
body.bbqcg-service-page .promise-card li{margin:7px 0;padding-left:2px;color:#354057!important}
body.bbqcg-service-page .promise-card li::marker{color:var(--red)}
body.bbqcg-service-page .notes{margin-top:26px;background:#f1eae4!important;color:var(--ink)!important;border:1px solid #e5d9d0;border-radius:20px;padding:clamp(22px,3vw,34px)}
body.bbqcg-service-page .notes h2{font-size:clamp(20px,2.5vw,26px);margin:0 0 12px;color:var(--navy)!important;font-weight:900;letter-spacing:-.035em}
body.bbqcg-service-page .notes p{max-width:1050px;margin:0 0 11px;color:#3b4156!important}
body.bbqcg-service-page .notes .small,body.bbqcg-service-page .small{font-size:13px;line-height:1.75;color:#545c6c!important}
body.bbqcg-service-page .buttons{display:flex;flex-wrap:wrap;gap:10px;margin-top:21px}
body.bbqcg-service-page .buttons a{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:10px 22px;border:1px solid var(--navy);border-radius:999px;background:var(--navy)!important;color:#fff!important;font-size:14px;font-weight:800}
body.bbqcg-service-page .buttons a.secondary{background:#fff!important;color:var(--navy)!important;border-color:#d9d4d1}
body.bbqcg-service-page .downloads{margin-top:54px}
body.bbqcg-service-page .downloads>.small{margin:10px 0 0}
body.bbqcg-service-page .downloads-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:20px 0 14px}
body.bbqcg-service-page .download-card{display:flex;flex-direction:column;align-items:flex-start;min-width:0;gap:11px;padding:26px;background:#fff!important;border:1px solid var(--line);border-radius:18px;color:var(--ink)!important;box-shadow:0 7px 20px #15183d08}
body.bbqcg-service-page .download-card strong{font-size:19px;letter-spacing:-.025em;color:var(--navy)!important}
body.bbqcg-service-page .download-card p{margin:0;color:#515a6d!important;font-size:14px;line-height:1.8}
body.bbqcg-service-page .download-card a{display:inline-flex;margin-top:auto;padding-top:13px;color:#9d142b!important;font-size:14px;font-weight:900;text-decoration:underline;text-underline-offset:4px}
body.bbqcg-service-page .promise-footer{background:var(--navy)!important;color:#eef0f8!important;padding:28px 0}
body.bbqcg-service-page .promise-footer-inner{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;align-items:center;gap:26px}
body.bbqcg-service-page .footer-brand{display:block;color:#fff!important;font-size:15px;font-weight:850}
body.bbqcg-service-page .footer-sub{display:block;font-size:12px;color:#c5cbdf!important;margin-top:3px}
body.bbqcg-service-page .footer-copy{color:#c5cbdf!important;font-size:12px}
body.bbqcg-service-page .footer-links{display:flex;flex-wrap:wrap;gap:18px}
body.bbqcg-service-page .footer-links a{font-size:12px;font-weight:800;color:#fff!important;text-decoration:underline;text-underline-offset:4px}
@media(max-width:820px){body.bbqcg-service-page .grid{grid-template-columns:1fr}body.bbqcg-service-page .promise-card{padding:23px}body.bbqcg-service-page .standards-section{margin-top:32px}body.bbqcg-service-page .promise-footer-inner{grid-template-columns:1fr auto}body.bbqcg-service-page .footer-copy{grid-column:1/-1;grid-row:2}body.bbqcg-service-page main#main{padding-top:20px!important}}
@media(max-width:600px){body.bbqcg-service-page .shell{width:calc(100% - 32px)}body.bbqcg-service-page .head{gap:10px;min-height:70px}body.bbqcg-service-page .promise-mark{font-size:29px}body.bbqcg-service-page .promise-brand{gap:10px}body.bbqcg-service-page .promise-brand strong{font-size:16px}body.bbqcg-service-page .promise-brand small{font-size:10px}body.bbqcg-service-page .home-link{padding:8px 12px;font-size:12px}body.bbqcg-service-page .promise-hero{border-radius:17px;padding:30px 23px}body.bbqcg-service-page .promise-hero:after{width:170px;height:170px}body.bbqcg-service-page .downloads-grid{grid-template-columns:1fr}body.bbqcg-service-page .promise-footer-inner{grid-template-columns:1fr;gap:14px}body.bbqcg-service-page .footer-copy{grid-column:auto;grid-row:auto}body.bbqcg-service-page .footer-links{gap:18px}}
@media print{body.bbqcg-service-page{background:#fff!important}body.bbqcg-service-page .promise-hero{box-shadow:none;background:#fff!important;color:#111!important;border:1px solid #ddd}body.bbqcg-service-page .promise-hero h1,body.bbqcg-service-page .promise-hero .eyebrow,body.bbqcg-service-page .promise-hero .lead{color:#111!important}body.bbqcg-service-page .promise-card,body.bbqcg-service-page .download-card{box-shadow:none;break-inside:avoid}body.bbqcg-service-page .home-link,body.bbqcg-service-page .buttons,body.bbqcg-service-page .download-card a,body.bbqcg-service-page .promise-footer{display:none!important}body.bbqcg-service-page .downloads{break-before:page}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}
export function renderBbqcgServiceStandards(request){
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
  const cards=GROUPS.map((group,index)=>`<article class="promise-card" aria-labelledby="qcs-${group.key}"><div class="card-top"><span class="tag">${esc(group.en)}</span><span class="card-num" aria-hidden="true">0${index+1}</span></div><h2 id="qcs-${group.key}">${esc(group.name)}</h2><p>${esc(group.intro)}</p><ul>${group.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></article>`).join('');
  const downloads='<section class="downloads" id="materials" aria-labelledby="materials-title"><p class="eyebrow">STORE RESOURCES</p><h2 id="materials-title">매장 소개 · 자료 다운로드</h2><p class="small">고객 안내와 빈 점검 양식을 확인하고 내려받을 수 있습니다. 공식 레시피와 본사 교육자료는 제공하지 않습니다.</p><div class="downloads-grid"><div class="download-card"><strong>매장 서비스 약속 안내문</strong><p>품질·청결·서비스 원칙을 한 장으로 정리한 인쇄용 자료입니다. 내려받은 HTML 파일을 열어 인쇄하거나 PDF로 저장할 수 있습니다.</p><a href="/bbqcg/resources/store-promise.html">안내문 다운로드 (.html)</a></div><div class="download-card"><strong>QCS·GMS 빈 점검표</strong><p>개점·영업·마감 체크와 고객 소통·마케팅 확인 항목을 정리한 표준 CSV 양식입니다. 실제 기록은 매장 내부에서 관리하세요.</p><a href="/bbqcg/resources/qcs-gms-checklist.csv">빈 점검표 다운로드 (.csv)</a></div></div><p class="small">이 자료는 매장 운영을 위한 자체 참고양식입니다. BBQ 본사의 공식 품질·위생·조리 기준이나 교육자료를 대신하지 않습니다.</p></section>';
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#b71d30"><title>우리 매장의 약속 | BBQ 무안청계점</title><link rel="stylesheet" href="/bbqcg/assets/service-standards.css?v=20261114a"></head>
<body class="bbqcg-service-page"><a class="skip" href="#main">본문 바로가기</a>
<header class="promise-header"><div class="shell head"><a class="promise-brand" href="/bbqcg" aria-label="BBQ 무안청계점 매장 홈"><span class="promise-mark" aria-hidden="true">BBQ</span><span><strong>BBQ 무안청계점</strong><small>우리 매장의 품질·청결·서비스 약속</small></span></a><a class="home-link" href="/bbqcg">매장 홈 <span aria-hidden="true">↗</span></a></div></header>
<main id="main" class="shell"><section class="promise-hero" aria-labelledby="promise-title"><p class="eyebrow">OUR SERVICE PROMISE</p><h1 id="promise-title">좋은 한 끼를 위한 세 가지 약속</h1>
<p class="lead">품질, 청결, 서비스를 우리 매장의 기본 원칙으로 삼습니다. 약속이 말에 그치지 않도록, 운영자가 직접 점검하고 개선합니다.</p></section>
<section class="standards-section" aria-labelledby="standards-title"><div class="section-head"><p class="eyebrow">OUR PRINCIPLES</p><h2 id="standards-title">매일 지키는 세 가지 기준</h2></div><div class="grid" aria-label="QCS 운영 원칙">${cards}</div></section>
<section class="notes" aria-labelledby="marketing"><h2 id="marketing">고객과의 약속은 정직한 안내에서 시작합니다</h2>
<p>BBQ 공식 메뉴·주문·멤버십 혜택은 실제 주문 시점의 공식 안내를 기준으로 확인해 주세요. 매장별 판매 메뉴, 가격, 주문 가능 시간과 혜택은 다를 수 있습니다.</p>
<p class="small">이 페이지는 무안청계점의 운영 원칙 안내이며, 본사의 조리법·공식 매뉴얼 또는 가맹 정책을 대체하지 않습니다. 고객 정보·내부 실적·교육자료 원문은 공개하지 않습니다.</p>
<div class="buttons"><a href="https://bbq.co.kr/" target="_blank" rel="noopener noreferrer">BBQ 공식 주문·메뉴</a><a class="secondary" href="/bbqcg">매장으로 돌아가기</a></div></section></main>
<footer class="promise-footer"><div class="shell promise-footer-inner"><div><strong class="footer-brand">BBQ 무안청계점</strong><span class="footer-sub">고객을 위한 매장 운영 약속</span></div><div class="footer-copy">© 2026 BBQ 무안청계점 · 고객 안내</div><nav class="footer-links" aria-label="매장 안내 링크"><a href="/bbqcg">매장 홈</a><a href="https://bbq.co.kr/" target="_blank" rel="noopener noreferrer">BBQ 공식 사이트</a></nav></div></footer></body></html>`;
  const enriched=html.replace('</main>',downloads+'</main>');
  return new Response(request.method==='HEAD'?null:enriched,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow,noarchive'}});
}


// Public assets contain only generic, store-authored descriptions and blank templates.
// They never embed BBQ proprietary training slides, recipes, customer information, or unverified offer terms.
const STORE_RESOURCE_BASE='/bbqcg/resources/';
const RESOURCE_NAMES=Object.freeze({
  'store-promise.html':'bbqcg-store-promise.html',
  'qcs-gms-checklist.csv':'bbqcg-qcs-gms-checklist.csv'
});
function printablePromise() {
  const cards=GROUPS.map(group=>'<section><h2>'+esc(group.name)+' / '+esc(group.en)+'</h2><p>'+esc(group.intro)+'</p><ul>'+group.items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></section>').join('');
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BBQ 무안청계점 서비스 약속</title><style>body{max-width:800px;margin:30px auto;padding:0 25px;font:16px/1.65 system-ui,"Noto Sans KR",sans-serif;color:#20223b;word-break:keep-all}h1{font-size:30px}h2{font-size:19px;color:#a41930}section{margin:20px 0;padding:10px 20px;border:1px solid #dedede;border-radius:10px}li{margin-bottom:5px}.note{font-size:12px;color:#555}header{border-bottom:3px solid #b21a30;padding-bottom:16px}@page{size:A4;margin:16mm}@media print{body{margin:0;padding:0}section{break-inside:avoid}}</style></head><body><header><b>BBQ 무안청계점</b><h1>좋은 한 끼를 위한 세 가지 약속</h1><p>매장은 품질·청결·서비스를 기본으로 운영하고 개선하겠습니다.</p></header>'+cards+'<p class="note">매장 자체 안내문 · 본사의 공식 조리·위생 지침이나 가맹 정책을 대신하지 않습니다. 메뉴·주문·혜택은 https://bbq.co.kr/ 에서 확인해 주세요.</p></body></html>';
}
function blankQcsGmsCsv(){
  const rows=[
    ['구분','단계','점검 항목','확인 여부','조치 사항'],
    ['QCS·품질','개점','오늘의 메뉴·판매 가능 여부와 공식 안내 확인','',''],
    ['QCS·청결','개점','매장 환경과 작업 공간 점검 (본사 기준 우선)','',''],
    ['QCS·서비스','영업 중','고객 주문과 포장 요청의 정확성 확인','',''],
    ['QCS·품질','영업 중','품질 관련 이상 여부 확인 및 책임자 보고','',''],
    ['QCS·청결','영업 중','매장 청결 상태 확인 및 이상 조치','',''],
    ['QCS·서비스','영업 중','문의·불편사항 사실 확인과 처리','',''],
    ['QCS·청결','마감','청소·정리·설비 점검 (본사 기준 우선)','',''],
    ['GMS·채널','마감','공식 주문·매장 채널의 운영상태 확인','',''],
    ['GMS·소통','마감','정당하게 접수된 고객 의견과 답변 점검','',''],
    ['GMS·개선','마감','개선 과제와 다음 영업일 전달 사항 확인','','']
  ];
  return '\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
}
export function bbqcgPublicResourceDownload(request, pathname){
  const key=String(pathname||'').startsWith(STORE_RESOURCE_BASE)?String(pathname).slice(STORE_RESOURCE_BASE.length):'';
  if(!Object.hasOwn(RESOURCE_NAMES,key))return new Response('자료를 찾을 수 없습니다.',{status:404,headers:{'cache-control':'no-store','x-robots-tag':'noindex,nofollow,noarchive'}});
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
  const html=key.endsWith('.html');
  const content=html?printablePromise():blankQcsGmsCsv();
  return new Response(request.method==='HEAD'?null:content,{status:200,headers:{
    'content-type':html?'text/html; charset=utf-8':'text/csv; charset=utf-8',
    'content-disposition':'attachment; filename="'+RESOURCE_NAMES[key]+'"',
    'x-content-type-options':'nosniff',
    'cache-control':'no-store',
    'x-robots-tag':'noindex,nofollow,noarchive'
  }});
}

// Site-owned composition: add a small entry to the existing storefront without
// touching its independently evolving premium layout or unrelated open CSS PRs.
export async function bbqcgHomeWithResources(response){
  if(response.status!==200 || !String(response.headers.get('content-type')||'').includes('text/html') || !response.body)return response;
  const original=await response.text();
  const navEnd='<a href="#directions">오시는 길</a></nav>';
  const nav=original.includes(navEnd)?original.replace(navEnd,'<a href="/bbqcg/service-guide">품질약속·자료실</a>'+navEnd):original;
  const block='<section class="wrap section" aria-labelledby="bbqcg-promise-heading"><div class="section-head"><div><p class="section-kicker">SERVICE PROMISE · MATERIALS</p><h2 id="bbqcg-promise-heading">우리 매장의 약속과 자료실</h2><p>품질·청결·서비스의 운영 원칙과 고객 안내문, 빈 점검표를 확인할 수 있습니다.</p></div><a href="/bbqcg/service-guide">소개·자료 다운로드 ›</a></div></section>';
  const composed=nav.includes('</main>')?nav.replace('</main>',block+'</main>'):nav;
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('etag');
  return new Response(composed,{status:response.status,statusText:response.statusText,headers});
}
