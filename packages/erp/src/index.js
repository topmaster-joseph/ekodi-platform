import { normalizeText } from '@ekodi/shared';

export const ERP_MODULES = Object.freeze(['finance', 'sales', 'purchasing', 'inventory', 'people']);

export function validateLedgerEntry(input) {
  if (!input || typeof input !== 'object') return { error: '전표 형식을 확인해 주세요.' };
  const account = normalizeText(input.account);
  const description = normalizeText(input.description);
  const amount = Number(input.amount);
  const occurredOn = normalizeText(input.occurredOn);
  if (!account || account.length > 80) return { error: '계정과목은 1~80자로 입력해 주세요.' };
  if (!Number.isSafeInteger(amount) || amount === 0) return { error: '금액은 0이 아닌 원 단위 정수여야 합니다.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return { error: '거래일은 YYYY-MM-DD 형식이어야 합니다.' };
  if (description.length > 240) return { error: '적요는 240자 이하여야 합니다.' };
  return { value: { account, description, amount, occurredOn } };
}
