// Deterministic internal worksheets, not statutory forms or statements of incorporation.
// Self-contained for the existing serialized browser client. Only saved private notes enter the packet.
export function cooperativePreparation(state) {
  const p=state.profile;
  const note=key=>(state.progress?.items||[]).find(row=>row.id.endsWith(':launch:'+key))?.note||'';
  const planTemplate=[
    `${p.name} 사업계획 검토용 초안`,
    '준비회의 작성 양식 · 실제 사업·계약·의결 확정 전',
    '작성 담당자 / 작성일 / 검토일: 미정',
    '1. 첫 공동사업 한 가지: [작성]',
    '2. 목적·필요와 조합원에게 돌아갈 이익: [작성]',
    '3. 품목·서비스 / 공급자 / 고객: [작성]',
    '4. 조합이 맡을 역할 / 각 참여자의 역할: [작성]',
    '5. 수량·판매가격·원가·수수료 계획과 산정 근거: [작성]',
    '6. 품질·배송·보관·반품·정산 책임과 담당: [작성]',
    '7. 실행 일정·필요 인력·시설·신고/허가 확인: [작성]',
    '8. 교육·정보제공·조합 간 협력 계획: [작성]',
    '9. 예상 수입·비용·자금 조달: 예산 초안과 대조',
    '10. 미결사항 / 확인 담당자 / 확인기한 / 다음 행동: [작성]',
    '검토 근거 보관 위치: [작성 · 민감정보 대신 위치만 기재]',
    '총회 의결·설립·실제 거래 완료를 뜻하지 않습니다.'
  ].join('\n');
  const budgetTemplate=[
    `${p.name} 수입·지출 예산 검토용 초안`,
    '준비회의 작성 양식 · 단위: 원 · 금액 미정은 미정으로 표시',
    '회계연도 / 작성 담당자 / 작성일 / 검토일: 미정',
    '1. 조직 개요: 사무소·출자 약정 등 실제 확인한 내용만 작성',
    '2. 수입 계획: 사업수입 / 사업외수입 / 출자금 / 차입금 / 기타',
    '항목별 금액·산정 근거·확정 여부: [작성]',
    '3. 지출 계획: 경상비(인건비·운영비) / 사업비 / 사업외지출 / 기타',
    '항목별 금액·산정 근거·지출 시점: [작성]',
    '4. 설립 준비비·정기 고정비·거래별 변동비: [작성]',
    '5. 수입 합계 / 지출 합계 / 차기 이월 계획: [작성 후 대조]',
    '6. 부족 자금·충당 방안과 담당: [작성]',
    '7. 인별 출자 약정·실제 납입 대조: [별도 확인 · 납입 사실 미확정]',
    '8. 미확정 지원금·보조금: 확정 여부와 근거를 구분하여 작성',
    '9. 미결사항 / 확인 담당자 / 확인기한 / 다음 행동: [작성]',
    '총회 의결 전 검토자료이며, 실제 수입·지출·납입의 증빙이 아닙니다.'
  ].join('\n');
  const packet=[
    `${p.name} 설립준비회의 자료 · 마지막 저장본`,
    '관리자 전용 검토자료 · 법정 제출서식·서명본·의결 결과가 아닙니다.',
    `표시 조합명: ${p.name} / 설립용 명칭(안): ${p.legalName}`,
    `조합장 예정 입력값: ${p.chair} · 실제 선출 여부 별도 확인`,
    `주사무소: ${p.officeConfirmed&&p.office?p.office+' (입력값 · 사용권 근거 대조)':'미확정'}`,
    `사업구역: ${p.businessArea||'미확정'}`,
    `입력된 출자 1좌 금액: ${Number(p.shareUnit).toLocaleString('ko-KR')}원 · 합의·납입 여부 별도 확인`,
    `입력된 첫해 예산: ${p.firstYearBudget===null||p.firstYearBudget===undefined?'미정':Number(p.firstYearBudget).toLocaleString('ko-KR')+'원 (의결 여부 별도 확인)'}`,
    '', '명부 입력값 · 실명·가입주체·자격·참여 의사 확인용',
    ...state.founders.map(f=>`${f.representative} / 사업자명 ${f.business||'추후 확인'} / 설립동의 ${f.consent==='confirmed'?'명부에 확인으로 입력됨 · 근거 대조':'확인 전'}`),
    '', '준비회의 결정 안건',
    '참여자·자격 / 첫 사업 / 사무소·사용권 / 출자 약정·설립비 / 임원 후보 검토',
    '정관안·사업계획·예산 작성 담당자와 작성일 / 미결사항의 담당자·확인기한',
    '', '사업계획 저장 초안', note('09')||'[저장된 초안 없음]',
    '', '예산 저장 초안', note('10')||'[저장된 초안 없음]',
    '', '다음 실행',
    '실제 회의 결과를 회의록에 기록하고, 근거를 대조한 항목만 출범 진행에서 확인하세요.',
    '최신 제출 서식·접수 요건은 관할기관 안내와 대조하세요.'
  ].join('\n');
  return {planTemplate,budgetTemplate,packet};
}
