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
:root{color-scheme:light;--red:#b71d30;--navy:#1b1b35;--cream:#f8f6f2;--line:#ebe6e0}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--navy);font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;word-break:keep-all;line-height:1.68}
a{color:inherit;text-decoration:none}.skip{position:absolute;left:-9999px}.skip:focus{left:12px;top:12px;z-index:100;background:white;padding:12px;border-radius:8px}a:focus-visible{outline:3px solid #b71d30;outline-offset:3px}
header{background:#fff;border-bottom:2px solid var(--red)}.shell{width:min(1060px,calc(100% - 32px));margin-inline:auto}
.head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;padding:18px 0}.head strong{font-size:clamp(18px,3vw,26px)}.head a{color:#951c2c;font-weight:750}
main{padding:38px 0 54px}h1{font-size:clamp(30px,5vw,48px);letter-spacing:-.05em;line-height:1.3;margin:10px 0}h2{font-size:clamp(20px,3vw,26px);letter-spacing:-.035em}.lead{max-width:730px;color:#535767;font-size:clamp(14px,2vw,17px)}
.eyebrow{font-weight:850;font-size:12px;letter-spacing:.14em;color:var(--red)}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:32px}
article{background:#fff;padding:22px;border:1px solid var(--line);border-radius:15px;min-width:0}
article h2{margin:6px 0}.tag{font-size:11px;letter-spacing:.1em;font-weight:900;color:#b51d2b}
article p{margin:0;color:#555767}ul{margin:15px 0 0;padding-left:20px;font-size:14px}li{margin:7px 0}
.notes{margin-top:26px;background:#f0e9e4;border-radius:15px;padding:22px}.notes p{margin:0 0 12px}.small{color:#626371;font-size:13px}
.buttons{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.buttons a{background:var(--navy);color:#fff;border-radius:999px;padding:10px 18px;font-size:14px;font-weight:750}.buttons a.secondary{background:#fff;border:1px solid var(--line);color:var(--navy)}
.downloads{margin-top:24px}.downloads-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.download-card{display:flex;flex-direction:column;gap:7px;min-width:0;background:#fff;border:1px solid var(--line);border-radius:14px;padding:19px}.download-card strong{font-size:17px}.download-card p{margin:0;color:#585b67;font-size:13px}.download-card a{display:inline-flex;align-self:flex-start;margin-top:auto;padding-top:5px;color:#a1192d;font-size:14px;font-weight:850;text-decoration:underline;text-underline-offset:4px}
@media(max-width:600px){.downloads-grid{grid-template-columns:1fr}}
@media print{.head a,.buttons,.download-card a{display:none!important}body{background:#fff}.downloads{break-before:page}.download-card{box-shadow:none}}

footer{border-top:1px solid var(--line);padding:18px 0;color:#555767;font-size:12px}
@media(max-width:820px){.grid{grid-template-columns:1fr}.head strong{font-size:18px}main{padding:25px 0 38px}article{padding:20px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}
export function renderBbqcgServiceStandards(request){
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
  const cards=GROUPS.map(group=>`<article aria-labelledby="qcs-${group.key}"><span class="tag">${esc(group.en)}</span><h2 id="qcs-${group.key}">${esc(group.name)}</h2><p>${esc(group.intro)}</p><ul>${group.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></article>`).join('');
  const downloads='<section class="downloads" id="materials" aria-labelledby="materials-title"><p class="eyebrow">STORE RESOURCES</p><h2 id="materials-title">매장 소개 · 자료 다운로드</h2><p class="small">고객 안내와 빈 점검 양식을 확인하고 내려받을 수 있습니다. 공식 레시피와 본사 교육자료는 제공하지 않습니다.</p><div class="downloads-grid"><div class="download-card"><strong>매장 서비스 약속 안내문</strong><p>품질·청결·서비스 원칙을 한 장으로 정리한 인쇄용 자료입니다. 내려받은 HTML 파일을 열어 인쇄하거나 PDF로 저장할 수 있습니다.</p><a href="/bbqcg/resources/store-promise.html">안내문 다운로드 (.html)</a></div><div class="download-card"><strong>QCS·GMS 빈 점검표</strong><p>개점·영업·마감 체크와 고객 소통·마케팅 확인 항목을 정리한 표준 CSV 양식입니다. 실제 기록은 매장 내부에서 관리하세요.</p><a href="/bbqcg/resources/qcs-gms-checklist.csv">빈 점검표 다운로드 (.csv)</a></div></div><p class="small">이 자료는 매장 운영을 위한 자체 참고양식입니다. BBQ 본사의 공식 품질·위생·조리 기준이나 교육자료를 대신하지 않습니다.</p></section>';
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#b71d30"><title>우리 매장의 약속 | BBQ 무안청계점</title><link rel="stylesheet" href="/bbqcg/assets/service-standards.css"></head>
<body><a class="skip" href="#main">본문 바로가기</a>
<header><div class="shell head"><strong>BBQ 무안청계점</strong><a href="/bbqcg">매장 홈</a></div></header>
<main id="main" class="shell"><p class="eyebrow">OUR SERVICE PROMISE</p><h1>좋은 한 끼를 위한 세 가지 약속</h1>
<p class="lead">품질, 청결, 서비스를 우리 매장의 기본 원칙으로 삼습니다. 약속이 말에 그치지 않도록, 운영자가 직접 점검하고 개선합니다.</p>
<section class="grid" aria-label="QCS 운영 원칙">${cards}</section>
<section class="notes" aria-labelledby="marketing"><h2 id="marketing">고객과의 약속은 정직한 안내에서 시작합니다</h2>
<p>BBQ 공식 메뉴·주문·멤버십 혜택은 실제 주문 시점의 공식 안내를 기준으로 확인해 주세요. 매장별 판매 메뉴, 가격, 주문 가능 시간과 혜택은 다를 수 있습니다.</p>
<p class="small">이 페이지는 무안청계점의 운영 원칙 안내이며, 본사의 조리법·공식 매뉴얼 또는 가맹 정책을 대체하지 않습니다. 고객 정보·내부 실적·교육자료 원문은 공개하지 않습니다.</p>
<div class="buttons"><a href="https://bbq.co.kr/" target="_blank" rel="noopener noreferrer">BBQ 공식 주문·메뉴</a><a class="secondary" href="/bbqcg">매장으로 돌아가기</a></div></section></main>
<footer><div class="shell">BBQ 무안청계점 · 고객을 위한 매장 운영 약속</div></footer></body></html>`;
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
