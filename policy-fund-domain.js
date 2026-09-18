// Canonical API surface: https://ekodi.kr/api/finance/policy-funds
export const POLICY_APPLICATION_STATUSES = Object.freeze([
  'discovered', 'eligible', 'preparing', 'submitted', 'supplement',
  'approved', 'rejected', 'executed', 'closed'
]);

export const POLICY_ELIGIBILITY_STATUSES = Object.freeze([
  'unknown', 'candidate', 'needs-review', 'eligible', 'ineligible'
]);

export const POLICY_LOAN_STATUSES = Object.freeze([
  'planned', 'active', 'grace', 'repaying', 'extended', 'refinanced', 'closed', 'delinquent'
]);

export const POLICY_EXTENSION_KINDS = Object.freeze([
  'repayment-extension', 'maturity-extension', 'refinance', 'deferment', 'other'
]);

export const POLICY_CASE_STATUSES = Object.freeze([
  'candidate', 'preparing', 'submitted', 'supplement', 'approved', 'rejected', 'completed', 'cancelled'
]);

export const POLICY_TASK_STATUSES = Object.freeze(['open', 'done', 'cancelled']);
export const POLICY_DOCUMENT_STATUSES = Object.freeze(['missing', 'requested', 'ready', 'submitted', 'expired']);

export function oneOf(value, allowed, fallback) {
  const normalized = String(value || '').trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

export function money(value, { minimum = 0 } = {}) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : null;
}

export function isoDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : text;
}

export function deadlineState(dueOn, now = new Date()) {
  const due = isoDate(dueOn);
  if (!due) return { band: 'none', days: null };
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = Date.parse(`${due}T00:00:00Z`);
  const days = Math.ceil((end - start) / 86400000);
  if (days < 0) return { band: 'overdue', days };
  if (days <= 7) return { band: 'd7', days };
  if (days <= 14) return { band: 'd14', days };
  if (days <= 30) return { band: 'd30', days };
  if (days <= 60) return { band: 'd60', days };
  if (days <= 90) return { band: 'd90', days };
  return { band: 'later', days };
}

export function nextPolicyMilestones(maturityOn) {
  const due = isoDate(maturityOn);
  if (!due) return [];
  const base = new Date(`${due}T00:00:00Z`);
  return [90, 60, 30, 14, 7].map(days => {
    const target = new Date(base.getTime() - days * 86400000);
    return { daysBefore: days, on: target.toISOString().slice(0, 10) };
  });
}

export function officialSource(url) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'https:' && (
      parsed.hostname === 'mss.go.kr' || parsed.hostname.endsWith('.mss.go.kr') ||
      parsed.hostname === 'semas.or.kr' || parsed.hostname.endsWith('.semas.or.kr') ||
      parsed.hostname === 'ols.semas.or.kr'
    );
  } catch {
    return false;
  }
}
