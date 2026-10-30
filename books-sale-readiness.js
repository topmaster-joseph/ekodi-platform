// BOOKS-SALE-READINESS-001 — 에코디서점 직접판매 준비도(서버 기준)
//
// `directSale.enabled`는 "판매 채널을 열 의도"일 뿐 판매 가능 증거가 아니다.
// 고객에게 구매 버튼·주문·결제 승인을 열려면 카탈로그의 출판 공정 기록이 모두 완료 상태여야 한다.
// 이 검사는 fail-closed다: 값이 없거나 'needs_verification'이면 판매하지 않는다.
//
// 이 모듈은 카탈로그에서 확인 가능한 조건만 본다. 그 밖의 조건은 기존 서버 게이트가 담당한다.
//   • 판매 파일 실재  → books-commerce.js fileReady (R2 head)
//   • 결제 준비       → ekodipay readiness (PAYMENTS_ENABLED · 운영키 · MID)
//   • 신규 판본 권리·출판 승인 → publishing/human/storefront-release-guard (PR #6718)
//   • 오디오북        → books-audiobook.js (권리·검수 미완료 시 미제공)
// 클라이언트(books/app.js)는 같은 규칙을 표시용으로만 따라 하고, 판매 판단은 항상 서버가 한다.

export const SALE_READY_WORKFLOW = Object.freeze({
  manuscript: ['complete'],
  editing: ['complete'],
  epub: ['validated'],
  cover: ['complete'],
  metadata: ['ready'],
  storefront: ['live'],
});

const LABELS = Object.freeze({
  DIRECT_SALE_DISABLED: '에코디서점 직접판매 대상 아님',
  SALE_FILE_UNDECLARED: '판매 파일 미지정',
  EDITION_UNAPPROVED: '판본 확정 전',
  PRICE_UNSET: '가격 확정 전',
});

/**
 * @returns {{ready:boolean, reasons:string[], label:string}}
 * label은 고객 화면에 보여줄 실제 상태 문구다(판매 가능하면 빈 문자열).
 */
export function saleReadiness(book) {
  const reasons = [];
  if (!book || typeof book !== 'object') return { ready: false, reasons: ['BOOK_MISSING'], label: '도서 정보 없음' };
  if (book.directSale?.enabled !== true) reasons.push('DIRECT_SALE_DISABLED');
  if (!String(book.directSale?.fileKey || '').trim()) reasons.push('SALE_FILE_UNDECLARED');
  if (!String(book.edition || '').trim()) reasons.push('EDITION_UNAPPROVED');
  if (!(Math.trunc(Number(book.listPrice?.amount)) > 0)) reasons.push('PRICE_UNSET');
  const workflow = book.workflow && typeof book.workflow === 'object' ? book.workflow : {};
  for (const [step, allowed] of Object.entries(SALE_READY_WORKFLOW)) {
    if (!allowed.includes(String(workflow[step] || ''))) reasons.push(`WORKFLOW_${step.toUpperCase()}_INCOMPLETE`);
  }
  return { ready: reasons.length === 0, reasons, label: reasons.length ? statusLabel(book, reasons) : '' };
}

/** 판매 불가 도서의 실제 상태 문구. 없는 상태를 만들어내지 않는다. */
export function statusLabel(book, reasons) {
  if (reasons.includes('DIRECT_SALE_DISABLED')) return LABELS.DIRECT_SALE_DISABLED;
  const production = ['MANUSCRIPT', 'EDITING', 'EPUB', 'COVER'].some(s => reasons.includes(`WORKFLOW_${s}_INCOMPLETE`));
  if (production || reasons.includes('EDITION_UNAPPROVED')) return '출간 준비 중';
  if (reasons.includes('PRICE_UNSET')) return LABELS.PRICE_UNSET;
  if (reasons.includes('SALE_FILE_UNDECLARED')) return LABELS.SALE_FILE_UNDECLARED;
  return '판매처 등록 중';
}

export const saleReady = book => saleReadiness(book).ready;
