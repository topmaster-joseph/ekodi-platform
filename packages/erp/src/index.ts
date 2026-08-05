import { normalizeText } from '@ekodi/shared';

export const ERP_MODULES = ['finance', 'sales', 'purchasing', 'inventory', 'people'] as const;

export interface LedgerEntry {
  account: string;
  description: string;
  amount: number;
  occurredOn: string;
}

export function validateLedgerEntry(input: unknown): { value: LedgerEntry; error?: never } | { error: string; value?: never } {
  if (!input || typeof input !== 'object') return { error: '전표 형식을 확인해 주세요.' };
  const source = input as Record<string, unknown>;
  const account = normalizeText(source.account);
  const description = normalizeText(source.description);
  const amount = Number(source.amount);
  const occurredOn = normalizeText(source.occurredOn);
  if (!account || account.length > 80) return { error: '계정과목은 1~80자로 입력해 주세요.' };
  if (!Number.isSafeInteger(amount) || amount === 0) return { error: '금액은 0이 아닌 원 단위 정수여야 합니다.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return { error: '거래일은 YYYY-MM-DD 형식이어야 합니다.' };
  if (description.length > 240) return { error: '적요는 240자 이하여야 합니다.' };
  return { value: { account, description, amount, occurredOn } };
}
