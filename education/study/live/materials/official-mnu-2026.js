// Instructor-supplied original official notice. The original PDF bytes are
// served as an additive first-party Education asset; no conversion to HWP.
// URL resolves relative to this module, so /edu remains canonical without
// relying on a cross-origin account, Google Drive permission, or private login.
export const OFFICIAL_MNU_2026=Object.freeze({
  id:'mnu-core-points-2026',
  title:'2026학년도 MNU핵심역량 포인트 프로그램 운영 안내',
  fileName:'2026학년도 MNU핵심역량 포인트 프로그램 운영 안내.pdf',
  publisher:'국립목포대학교 학생취업처',
  issuedOn:'2026-08-25',
  documentNo:'취업지원실-5071',
  pages:2,
  size:178412,
  sha256:'618fdf345913b58d632bd7505c505d0c39bc097ebf35908b0fa502ba20921876',
  href:new URL('./mnu-2026-core-competency-points.pdf',import.meta.url).href
});
export const OFFICIAL_MNU_PROMPT=
  '첨부한 「2026학년도 MNU핵심역량 포인트 프로그램 운영 안내」 PDF 원문만 근거로 답해 주세요. '+
  '① 학생용 200자 이내 공지 ② 담당자 점검표(대상·신청 경로·대상기간·포인트 승인기한·장학생 선발 및 제외 기준) '+
  '③ 2022~2025 장학금 지급현황 4개 연도 표를 작성하세요. '+
  '확정된 사실과 미확정 사항을 구분하고, 각 주요 항목에 근거 페이지(1~2쪽)를 표시하세요. '+
  '문서에 없는 전화번호·지급액·새 일정은 추측하지 말고 [원문 확인 필요]라고 적으세요. '+
  '2026년 자료이므로 현재 공지로 발송하기 전에는 담당 부서에서 유효성을 재확인해야 합니다.';
export function officialMnuPracticeCard(esc){
  const f=OFFICIAL_MNU_2026;
  return '<section class="panel original-pdf-card" aria-label="실제 대학 공문 PDF 실습자료">'+
    '<p class="eyebrow">추가 실습자료 · 실제 공문 원본 PDF</p>'+
    '<h3>'+esc(f.title)+'</h3>'+
    '<p class="meta">'+esc(f.publisher)+' · '+esc(f.issuedOn)+' · 문서 '+esc(f.documentNo)+' · '+f.pages+'쪽 · 강사 제공 원본</p>'+
    '<div class="btn-row"><a class="btn btn-primary" href="'+esc(f.href)+'" target="_blank" rel="noopener noreferrer">원본 PDF 화면으로 보기</a>'+
    '<a class="btn" href="'+esc(f.href)+'" download="'+esc(f.fileName)+'">원본 PDF 다운로드</a>'+
    '<button type="button" class="btn" data-copy-official-mnu="1">FactChat 실습 질문 복사</button></div>'+
    '<details class="official-pdf-facts" open><summary>원문 내용 미리보기 · 실습에 사용할 확인 사항</summary>'+
    '<p class="meta"><b>대상:</b> 국립목포대학교 재학생(전남도립대 입학생 포함). <b>신청:</b> 통합학사정보시스템 핵심역량 포인트 메뉴(일부 이전 입학생은 경력개발시스템 이용).</p>'+
    '<p class="meta"><b>대상 기간:</b> 2026년 1월 1일~12월 31일. <b>포인트 승인:</b> 2026년 12월 31일까지. <b>장학생 선발:</b> 학년별 필수활동 영역 이수자.</p>'+
    '<p class="meta"><b>제외:</b> 지급 기준 휴학·졸업(수료)·제적, 동일 학년 장학금 중복 수혜 등. 원본에 제시된 최근 4년 지급표의 수치와 제외 조건은 PDF에서 직접 대조합니다.</p>'+
    '</details><p class="meta">실습 순서: PDF 열기/내려받기 → FactChat 일반 채팅에 PDF 첨부(기관 허용 기능 확인) → 실습 질문 실행 → 원문과 대조 → 결과물 확인. 실제 학사·인사 개인정보는 추가하지 마세요.</p>'+
    '<p class="meta"><strong>실습 종료 후:</strong> 개인 기기의 PDF·결과물과 본인의 FactChat 대화기록을 각각 확인하고 삭제합니다. 기존 4시간·2시간 가상 샘플은 그대로 유지됩니다.</p>'+
    '</section>';
}
