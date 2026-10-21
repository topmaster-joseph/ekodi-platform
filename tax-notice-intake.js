function clean(value = '') {
  return String(value ?? '').replace(/\r/g, '').trim();
}

function numberValue(value) {
  const normalized = clean(value).replace(/[^0-9.-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function integerValue(value) {
  const number = numberValue(value);
  return number === null ? null : Math.trunc(number);
}

function field(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:▧|☞|▶)?\\s*${escaped}\\s*[:：]\\s*([^\\n]+)`, 'i'));
  return clean(match?.[1] || '');
}

function emailAfter(text, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}[^\\n:：]*[:：]\\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})`, 'i'));
  return clean(match?.[1] || '');
}
function periodValue(value) {
  const match = clean(value).match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
}

function dateValue(value) {
  const match = clean(value).match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return '';
  return `${match[1]}${String(Number(match[2])).padStart(2, '0')}${String(Number(match[3])).padStart(2, '0')}`;
}

function monthEnd(period) {
  const match = String(period).match(/^(20\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${match[1]}${match[2]}${String(day).padStart(2, '0')}`;
}

function senderBranch(text) {
  const match = text.match(/<\s*한국전력공사\s+([^>]+?)\s+전력구입금액\s+지급\s+안내\s*>/);
  return match ? `한국전력공사 ${clean(match[1])}` : '한국전력공사';
}
function remoteMeterFee(text) {
  const match = text.match(/원격검침\s*수수료\s*([\d,]+)\s*원/i);
  return match ? integerValue(match[1]) : 0;
}

function requiredNumber(text, label, errors) {
  const value = integerValue(field(text, label));
  if (value === null) errors.push(`${label}을(를) 확인할 수 없습니다.`);
  return value ?? 0;
}

export function parseTaxInvoiceNotice(input) {
  const text = clean(input);
  const errors = [];
  const warnings = [];
  if (!text) return { valid: false, provider: 'UNKNOWN', errors: ['안내문 내용이 비어 있습니다.'], warnings: [] };
  if (!/한국전력공사/.test(text) || !/전력구입금액/.test(text)) {
    return { valid: false, provider: 'UNKNOWN', errors: ['현재는 한국전력공사 전력구입금액 안내문을 지원합니다.'], warnings: [] };
  }

  const targetPeriod = periodValue(field(text, '대상연월'));
  const plantName = field(text, '발전소명');
  const customerMaskedName = field(text, '고 객 명') || field(text, '고객명');
  const rawTaxRegId = integerValue(field(text, '종사업장번호'));
  const buyerTaxRegId = rawTaxRegId === null ? '' : String(rawTaxRegId).padStart(3, '0');
  const supplyAmount = requiredNumber(text, '공급가액', errors);
  const taxAmount = requiredNumber(text, '부가세액', errors);
  const totalAmount = requiredNumber(text, '총구입금액', errors);
  const totalKwh = requiredNumber(text, '총구입량', errors);
  const settlementKwh = integerValue(field(text, '정 산 량')) ?? 0;
  const purchaseKwh = integerValue(field(text, '구 입 량')) ?? totalKwh;
  const unitPrice = numberValue(field(text, '당월 SMP단가') || field(text, '기준단가')) ?? 0;
  const paymentDueDate = dateValue(field(text, '지급예정일'));
  const deductionAmount = remoteMeterFee(text);
  const expectedReceiptAmount = Math.max(0, totalAmount - deductionAmount);
  const homeTaxEmail = emailAfter(text, '국세청 홈택스에서 발행');
  const otherEmail = emailAfter(text, '그 외');

  if (!targetPeriod) errors.push('대상연월을 확인할 수 없습니다.');
  if (!plantName) errors.push('발전소명을 확인할 수 없습니다.');
  if (!buyerTaxRegId) errors.push('한국전력 종사업장번호를 확인할 수 없습니다.');
  if (!homeTaxEmail) errors.push('홈택스 발행용 이메일을 확인할 수 없습니다.');
  if (supplyAmount + taxAmount !== totalAmount) errors.push('공급가액 + 부가세액과 총구입금액이 일치하지 않습니다.');
  if (purchaseKwh + settlementKwh !== totalKwh) warnings.push('구입량 + 정산량과 총구입량이 다릅니다. 원문을 확인해 주세요.');
  warnings.push('작성일자는 대상연월 말일로 제안됩니다. 실제 세금계산서 작성일자는 공급시기와 세무기준을 확인한 뒤 승인해 주세요.');
  warnings.push('안내문에는 한국전력공사의 사업자번호·대표자 정보가 없으므로 저장된 거래처와 매칭해야 초안을 만들 수 있습니다.');

  const suggestedWriteDate = monthEnd(targetPeriod);
  const periodLabel = targetPeriod ? targetPeriod.replace('-', '.') : '';
  return {
    valid: errors.length === 0,
    provider: 'KEPCO_PPA_NOTICE_V1',
    errors,
    warnings,
    sender: senderBranch(text),
    buyerHint: '한국전력공사',
    buyerTaxRegId,
    supplierHint: plantName,
    customerMaskedName,
    targetPeriod,
    suggestedWriteDate,
    paymentDueDate,
    purchaseKwh,
    settlementKwh,
    totalKwh,
    unitPrice,
    supplyAmount,
    taxAmount,
    totalAmount,
    deductionAmount,
    expectedReceiptAmount,
    emails: { homeTax: homeTaxEmail, other: otherEmail },
    item: {
      itemName: `${periodLabel} 전력 판매`,
      spec: unitPrice ? `${unitPrice}원/kWh` : '',
      qty: String(totalKwh || 1),
      unitCost: unitPrice ? String(unitPrice) : String(supplyAmount),
      supplyCost: supplyAmount,
      tax: taxAmount,
      remark: plantName
    }
  };
}
