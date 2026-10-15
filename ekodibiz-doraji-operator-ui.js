const ROOT='/ekodibiz/doraji';
const JS_PATH=ROOT+'/office.js';
const PAGE_PATH=ROOT+'/office';
const LOGIN='https://ekodi.kr/auth/?site=admin&direct=1&return_to=https%3A%2F%2Fekodi.kr%2Fadmin%2F';
export function isDorajiOperatorPath(path){return path===PAGE_PATH||path===PAGE_PATH+'/'||path===JS_PATH}
export function dorajiOperatorResponse(request){
 const path=new URL(request.url).pathname;
 if(!isDorajiOperatorPath(path))return null;
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
 if(path===JS_PATH)return new Response('',{status:503}); // Script source is served by the static asset pipeline after the route check.
 return new Response(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>사업 업무원장 | EKODIBIZ 도라지</title>
<style>
:root{font-family:system-ui,"Noto Sans KR",sans-serif;color:#25352c;background:#f7f9f6}*{box-sizing:border-box}body{margin:0}
main{max-width:1160px;margin:0 auto;padding:22px 18px 70px}a{color:#285a3b;text-decoration:none}.top{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px}
h1{font-size:clamp(26px,3vw,38px);margin:22px 0 7px;letter-spacing:-.035em}h2{font-size:18px;margin:0 0 13px}p{line-height:1.45}.sub{color:#68786e;margin:0 0 15px}.tag{display:inline-block;border:1px solid #cfdbd0;border-radius:20px;padding:5px 10px;font-size:12px;color:#456a50}
.alert{border:1px solid #cadccd;border-left:4px solid #2f6948;background:white;border-radius:8px;padding:12px 15px;margin:15px 0;font-size:13px}.alert[data-kind=error]{border-left-color:#a84e3d;color:#8a3e30}
.panel{background:#fff;border:1px solid #dfe7df;border-radius:12px;padding:18px;margin-top:13px}.two{display:grid;grid-template-columns:1fr 1fr;gap:13px}.row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.row.wide{grid-template-columns:1fr}
label{display:block;font-size:13px;font-weight:650;margin:7px 0}input,select,textarea{display:block;width:100%;margin-top:5px;border:1px solid #cad6cb;border-radius:7px;padding:9px 10px;background:white;font:inherit;font-weight:400;min-width:0}
textarea{min-height:73px;resize:vertical}button,.primary{display:inline-block;background:#245237;color:white;border:0;padding:10px 13px;border-radius:7px;font:inherit;font-size:13px;cursor:pointer}.secondary{background:#edf3ee;color:#315441}.actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.record{border-top:1px solid #edf1ed;padding:10px 0}.record strong,.record small{display:block}.record small{font-size:12px;color:#62756a;margin-top:4px}.record p{margin:5px 0}
.empty{color:#78847b}ol.audit{margin:8px 0 0;padding-left:21px;max-height:160px;overflow:auto;font-size:12px;color:#637367}li{padding:3px 0}
footer{color:#6a796f;font-size:12px;margin-top:20px}.warning{font-size:12px;color:#815c2d}
@media(max-width:760px){.two,.row{grid-template-columns:1fr}main{padding:15px 12px 48px}.panel{padding:13px}}
</style></head>
<body><main data-ekodi-workspace="ekodibiz" data-ekodi-business-unit="doraji" data-ekodi-office="draft-ledger">
<div class="top"><strong>EKODIBIZ · 도라지 계약재배</strong><a href="${ROOT}">사업총괄로 돌아가기 →</a></div>
<h1>사업 업무원장 <span class="tag">관리자 · 초안 전용</span></h1>
<p class="sub">단위사업·재배·예산·수매계약·납품·문서 초안을 한곳에서 관리합니다. 계약 체결, 결제 및 정산 승인은 이 화면에서 진행하지 않습니다.</p>
<div class="alert" id="office-status" role="status" aria-live="polite">기존 에코디 관리자 세션을 확인합니다.</div>
<section class="panel" id="office-login"><h2>중앙 관리자 로그인</h2><p>개인 사업정보는 공개하지 않습니다. 기존 에코디 관리자 계정으로 로그인한 뒤 이 화면으로 돌아오세요.</p><a class="primary" href="${LOGIN}">중앙 관리자 로그인</a><button type="button" id="connect" class="secondary">기존 로그인 다시 확인</button><p class="warning">원장 DB의 운영 마이그레이션 승인 전에는 저장 기능이 활성화되지 않습니다.</p></section>
<div id="office-data" hidden>
<section class="panel"><h2>단위사업 선택·등록</h2><div class="row wide"><label for="project-select">등록 사업<select id="project-select"></select></label></div><div class="actions"><button type="button" id="refresh" class="secondary">새로고침</button></div><form id="project-form"><div class="row"><label>사업명<input name="name" required maxlength="160" placeholder="예: 도라지 비닐하우스 1차"></label><label>재배지역<input name="region" maxlength="160" placeholder="읍면동 또는 농장명"></label><label>하우스 동수<input name="greenhouseCount" type="number" min="0" max="100000" value="1" required></label><label>재배면적 (㎡)<input name="areaSqm" type="number" min="0" max="100000000" step="0.1" value="500" required></label></div><div class="actions"><button type="submit">단위사업 초안 등록</button></div></form></section>
<div class="two"><section class="panel"><h2>업무기록 입력</h2><label for="record-kind">업무 구분<select id="record-kind"><option value="cultivation">재배일지</option><option value="budget">예산·지출 초안</option><option value="contract">수매계약 초안</option><option value="delivery">납품·정산 초안</option><option value="document">문서·증빙 메타데이터</option></select></label><form id="record-form" hidden><div class="row"><label>기록일<input id="record-date" name="date" type="date" required></label><label>제목<input name="title" maxlength="160" required></label></div><label>업무 내용<textarea name="note" maxlength="2000" placeholder="사실과 계획을 구분하여 입력하세요."></textarea></label><div class="row"><label>수량 (kg)<input name="quantityKg" type="number" min="0" max="1000000000" step="0.01" value="0"></label><label>금액 (원, 입력값)<input name="amountKRW" type="number" min="0" max="9000000000000000" step="1" value="0"></label><label>거래처·상대기관<input name="counterparty" maxlength="160"></label><label>참조번호<input name="reference" maxlength="240"></label></div><div class="actions"><button type="submit">초안 저장</button></div></form><p class="warning">입력금액은 지급·입금·매출 확정이 아닙니다.</p></section>
<section class="panel"><h2>기록 목록</h2><div id="record-list"><p class="empty">사업을 선택해 주세요.</p></div></section></div>
<section class="panel"><h2>변경 감사 이력</h2><ol class="audit" id="audit-list"></ol></section>
</div><footer>공통 Business OS · 저장권한은 서버에서 검증 · 모든 계약 및 정산은 별도 승인 필요</footer>
</main><script src="${JS_PATH}" defer></script></body></html>`,
 {headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow, noarchive'}});
}
