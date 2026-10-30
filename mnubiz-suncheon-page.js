const BASE='/mnubiz/seminars/suncheon-2026';
const SITE='국립목포대학교 경영동문회';
const TITLE='2026 순천·광양 해양비즈니스 연구 세미나';
function htmlResponse(body,privatePage=false){
  const title=privatePage?'참가회원 정산 · '+TITLE:TITLE;
  const html='<!doctype html><html lang="ko" data-ekodi-ui-surface="user-public" data-ekodi-site-subject="mnubiz" data-ekodi-user-header="default" data-ekodi-user-ai-entry="off"><head>'+
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
  '<meta name="robots" content="'+(privatePage?'noindex,nofollow,noarchive':'index,follow')+'">'+
  '<title>'+title+' · '+SITE+'</title>'+
  '<meta name="description" content="해양물류·항만 배후단지 조세특례·AI 기반 해양비즈니스 연구 세미나 기본계획">'+
  '<link rel="canonical" href="https://ekodi.kr'+BASE+(privatePage?'/settlement':'')+'">'+
  '<link rel="stylesheet" href="'+BASE+'/style.css?v=20261031">'+
  '</head><body><header class="site-header mnubiz-header" role="banner"><div class="mnubiz-wrap mnubiz-header__inner">'+
  '<a class="mnubiz-brand" data-ekodi-header-home href="/mnubiz/"><span class="mnubiz-brand__mark">MNU</span><span><strong data-ekodi-header-site-name>'+SITE+'</strong><small>BUSINESS ALUMNI</small></span></a>'+
  '<nav class="mnubiz-nav" data-ekodi-header-actions aria-label="주요 메뉴"><a href="/mnubiz/">동문회</a><a href="'+BASE+'">세미나 소개</a><a href="'+BASE+'/settlement">회원 정산</a></nav></div></header>'+
  '<main class="mnubiz-event" id="main"><div class="mnubiz-wrap">'+body+'</div></main>'+
  '<div class="mnubiz-service-note">EKODI · 국립목포대학교 경영동문회 · 본 계획은 승인·예약 이전의 초안입니다.</div>'+
  (privatePage?'<script type="module" src="'+BASE+'/client.js?v=20261031"></script>':'')+'</body></html>';
  const headers={'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-workspace':'mnubiz','x-ekodi-site-subject':'mnubiz'};
  if(privatePage)headers['x-robots-tag']='noindex, nofollow, noarchive';
  return new Response(html,{headers});
}
function overview(){
 const body='<section class="mnubiz-event-heading"><p class="mnubiz-tag">2026 · MARINE BUSINESS SEMINAR</p><h1>'+TITLE+'</h1>'+
 '<p class="mnubiz-intro">지역 항만과 해양물류의 미래를 연구하는 1박 2일 학술 세미나입니다. 연구진의 논의와 산학 협력 기회를 중심으로 운영합니다.</p>'+
 '<div class="mnubiz-info"><span><b>일정</b> 2026.11.26.(목)~27.(금)</span><span><b>지역</b> 전남 순천 · 광양항 연계</span><span><b>참가</b> 6명(예정)</span><span><b>담당</b> 김기범 책임교수(안)</span></div>'+
 '<div class="mnubiz-actions"><a class="mnubiz-btn primary" href="'+BASE+'/settlement">회원 정산 확인</a><a class="mnubiz-btn" href="/mnubiz/">동문회로 돌아가기</a></div></section>'+
 '<section class="mnubiz-block"><h2>주요 연구 의제</h2><div class="mnubiz-two"><article><h3>해양물류·항만</h3><p>광양항·목포신항 배후산업의 물류 흐름과 항만 네트워크 연구 과제를 도출합니다.</p></article><article><h3>금융·세무·AI</h3><p>관세·조세특례 실무와 AI 기반 데이터 수집·연구방법을 결합하여 공동연구 계획을 세웁니다.</p></article></div></section>'+
 '<section class="mnubiz-block"><h2>진행 일정(안)</h2><div class="mnubiz-table-scroll"><table><thead><tr><th>일자</th><th>시간</th><th>내용</th></tr></thead><tbody>'+
 '<tr><td>11월 26일</td><td>11:30~13:20</td><td>등록·사업목적 안내·점심(자부담)</td></tr>'+
 '<tr><td>11월 26일</td><td>13:20~17:40</td><td>해양물류 연구발제 · 외부 전문가 자문 · AI 연구방법론</td></tr>'+
 '<tr><td>11월 26일</td><td>18:00~19:10</td><td>공식 학술협의 및 회의록 작성</td></tr>'+
 '<tr><td>11월 27일</td><td>09:00~12:00</td><td>광양항 기관방문(허가 시) 또는 공개자료 분석</td></tr>'+
 '<tr><td>11월 27일</td><td>13:00~15:30</td><td>공동연구 실행계획 · 결과 정리 · 폐회</td></tr>'+
 '</tbody></table></div></section>'+
 '<section class="mnubiz-block"><h2>재원별 계획 예산</h2><div class="mnubiz-summary"><article><small>대학 지원금 신청(안)</small><strong>1,200,000원</strong><p>회의실·자료 인쇄·전문가 자문·공식 학술회의비·적격 여비·보험</p></article><article><small>참가자 6명 공동 자부담(안)</small><strong>720,000원</strong><p>숙박 390,000원 · 개인식사 240,000원 · 현지이동 90,000원</p></article><article><small>총 계획액</small><strong>1,920,000원</strong><p>자부담 1인 기준 120,000원 · 실제 비용은 승인과 실비 증빙에 따라 달라집니다.</p></article></div>'+
 '<p class="mnubiz-note">본 안내는 확정된 여행상품·예약·학교 지원금 지급 통지가 아닙니다. 공식 연구회의 식사와 개인식사는 중복 정산하지 않으며, 참석자 명단·개인 정산자료는 회원 인증 후에만 제공합니다.</p></section>';
 return htmlResponse(body);
}
function settlement(){
 const body='<section class="mnubiz-event-heading"><p class="mnubiz-tag">MEMBERS · PRIVATE SETTLEMENT</p><h1>순천 세미나 회원 정산</h1>'+
 '<p class="mnubiz-intro">지원금과 자부담을 구분하고, 본인의 신청·지출·납부 확인 내역만 볼 수 있습니다. 금액 신고는 입금 확인을 의미하지 않습니다.</p>'+
 '<div class="mnubiz-info"><span><b>기간</b> 2026.11.26.~27.</span><span><b>공동 자부담(안)</b> 720,000원</span><span><b>1인 예정 부담</b> 120,000원</span></div>'+
 '<div class="mnubiz-actions"><a class="mnubiz-btn" href="'+BASE+'">기본계획 보기</a><a class="mnubiz-btn" href="/mnubiz/">동문회로 이동</a></div></section>'+
 '<section class="mnubiz-block"><h2>내 참여 및 정산 상태</h2><p id="settlement-message" role="status" aria-live="polite">통합인증 및 소속 권한을 확인하고 있습니다.</p>'+
 '<div id="settlement-auth" hidden><a class="mnubiz-btn primary" id="seminar-login" href="https://ekodi.kr/auth/?site=space">Google 통합 로그인</a></div>'+
 '<div id="settlement-member" hidden><p id="settlement-account"></p><p id="settlement-state"></p><button id="apply-participant" class="mnubiz-btn primary" type="button" hidden>참여 신청</button>'+
 '<div class="mnubiz-summary"><article><small>기준 개인부담(계획)</small><strong>120,000원</strong></article><article><small>승인된 납부 신고액</small><strong id="my-contribution">0원</strong></article><article><small>승인된 개인지출 신고액</small><strong id="my-expense">0원</strong></article></div>'+
 '<h3>내 지출·납부 신고</h3><form id="seminar-claim-form" hidden><label>구분<select name="kind"><option value="contribution">납부 신고</option><option value="personal_expense">개인지출 신고</option></select></label>'+
 '<label>항목<select name="category"><option>참가비</option><option>숙박</option><option>개인식사</option><option>현지이동</option><option>기타</option></select></label>'+
 '<label>금액(원)<input name="amount_krw" type="number" min="1" max="5000000" step="1" required></label>'+
 '<label class="full">메모(계좌번호 등 민감정보 입력 금지)<input name="memo" maxlength="250" placeholder="예: 11/25 참가비 이체 신고"></label>'+
 '<div class="full"><button type="submit" class="mnubiz-btn primary">확인 요청 제출</button></div></form>'+
 '<p class="mnubiz-note">입금·지출 신고는 운영담당자의 영수증·계좌 내역 검증을 거친 후에만 확정됩니다. 개인정보와 계좌번호는 이 화면에 입력하지 마세요.</p>'+
 '<div class="mnubiz-table-scroll"><table><thead><tr><th>일시</th><th>구분</th><th>항목</th><th>금액</th><th>확인 상태</th></tr></thead><tbody id="my-claims"><tr><td colspan="5">조회 중</td></tr></tbody></table></div>'+
 '</div></section>'+
 '<section id="settlement-review" class="mnubiz-block" hidden><h2>운영담당자 확인</h2><p>참가승인과 금액확정은 소속 운영권한을 가진 담당자만 가능합니다. 승인된 회원의 상태만 업데이트합니다.</p>'+
 '<div class="mnubiz-table-scroll"><table><thead><tr><th>회원 식별번호</th><th>참가신청</th><th>처리</th></tr></thead><tbody id="review-participants"></tbody></table></div>'+
 '<h3>신고 확인</h3><div class="mnubiz-table-scroll"><table><thead><tr><th>회원 식별번호</th><th>구분</th><th>금액</th><th>상태</th><th>처리</th></tr></thead><tbody id="review-claims"></tbody></table></div></section>'+
 '<section class="mnubiz-block"><h2>자부담 예산 기준</h2><div class="mnubiz-table-scroll"><table><thead><tr><th>항목</th><th>산출</th><th>합계</th></tr></thead><tbody>'+
 '<tr><td>숙박비</td><td>2인 1실 × 3실 × 130,000원</td><td>390,000원</td></tr><tr><td>개인식사</td><td>6명 × 40,000원</td><td>240,000원</td></tr><tr><td>현지이동</td><td>1식</td><td>90,000원</td></tr><tr><th colspan="2">합계</th><th>720,000원</th></tr>'+
 '</tbody></table></div><p class="mnubiz-note">정산내역이 없으면 임의로 납부완료 처리하지 않습니다. 지원금 120만원과 개인 공동자부담 72만원은 원칙적으로 별도 관리합니다.</p></section>';
 return htmlResponse(body,true);
}
export function isMnuBizSuncheonPath(pathname){return pathname===BASE||pathname===BASE+'/'||pathname===BASE+'/settlement'||pathname===BASE+'/settlement/';}
export function renderMnuBizSuncheonPage(pathname){return pathname.includes('/settlement')?settlement():overview();}
