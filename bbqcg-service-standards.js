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
footer{border-top:1px solid var(--line);padding:18px 0;color:#555767;font-size:12px}
@media(max-width:820px){.grid{grid-template-columns:1fr}.head strong{font-size:18px}main{padding:25px 0 38px}article{padding:20px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}
export function renderBbqcgServiceStandards(request){
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
  const cards=GROUPS.map(group=>`<article aria-labelledby="qcs-${group.key}"><span class="tag">${esc(group.en)}</span><h2 id="qcs-${group.key}">${esc(group.name)}</h2><p>${esc(group.intro)}</p><ul>${group.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></article>`).join('');
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
  return new Response(request.method==='HEAD'?null:html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow,noarchive'}});
}
