export const PAYMENT_SOURCE_TYPES = Object.freeze([
  'mall.order',
  'church.donation',
  'membership.invoice',
  'course.enrollment',
  'reservation.deposit',
  'platform.subscription',
  'platform.service',
]);

export const PAYMENT_STATUSES = Object.freeze([
  'READY',
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'PARTIAL_REFUNDED',
  'REFUNDED',
]);

export const PAYMENT_ROLLOUT_MODES = Object.freeze(['off', 'shadow', 'canary', 'on']);

const SENSITIVE_PAYMENT_KEYS = new Set([
  'card', 'cardnumber', 'card_number', 'pan', 'cvc', 'cvv', 'securitycode', 'security_code',
  'expiry', 'expirymonth', 'expiry_month', 'expiryyear', 'expiry_year', 'track1', 'track2',
]);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function normalizeRolloutMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return PAYMENT_ROLLOUT_MODES.includes(mode) ? mode : 'off';
}

function sensitivePath(value, path = '$', seen = new Set()) {
  if (!value || typeof value !== 'object') return '';
  if (seen.has(value)) return '';
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = sensitivePath(value[index], `${path}[${index}]`, seen);
      if (found) return found;
    }
    return '';
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (SENSITIVE_PAYMENT_KEYS.has(normalized)) return `${path}.${key}`;
    const found = sensitivePath(child, `${path}.${key}`, seen);
    if (found) return found;
  }
  return '';
}

function cleanString(value, field, { max = 160, id = false } = {}) {
  if (typeof value !== 'string') throw new Error(`${field}_required`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) throw new Error(`${field}_invalid`);
  if (id && !SAFE_ID.test(cleaned)) throw new Error(`${field}_invalid`);
  return cleaned;
}

export function validatePaymentIntentInput(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_payload');
  const forbidden = sensitivePath(input);
  if (forbidden) throw new Error(`raw_payment_data_forbidden:${forbidden}`);

  const workspaceId = cleanString(input.workspace_id, 'workspace_id', { id: true });
  const sourceType = cleanString(input.source_type, 'source_type', { max: 80 });
  const sourceId = cleanString(input.source_id, 'source_id', { id: true });
  const title = cleanString(input.title, 'title', { max: 160 });
  const orderNo = input.order_no == null ? '' : cleanString(input.order_no, 'order_no', { id: true });
  const currency = String(input.currency || 'KRW').trim().toUpperCase();

  if (!PAYMENT_SOURCE_TYPES.includes(sourceType)) throw new Error('source_type_not_allowed');
  if (currency !== 'KRW') throw new Error('currency_not_supported');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('amount_must_be_positive_integer');
  if (sourceType === 'church.donation' && options.donationApproved !== true) throw new Error('donation_payment_not_approved');

  return Object.freeze({
    workspace_id: workspaceId,
    source_type: sourceType,
    source_id: sourceId,
    order_no: orderNo,
    title,
    amount: input.amount,
    currency,
  });
}

export function paymentCapabilities(env = {}) {
  const rollout = normalizeRolloutMode(env.EKODI_PAYMENT_ROLLOUT);
  return Object.freeze({
    service: 'ekodi-payment',
    canonical: 'https://pay.ekodi.kr',
    boundary: 'registered-common-service',
    providerModel: 'replaceable-adapter',
    workspaceIdentity: 'workspace_id',
    rollout,
    transactionExecution: false,
    rawCardStorage: false,
    platformFundPooling: false,
    donationPayments: String(env.ALLOW_DONATION_PAYMENTS || '').toLowerCase() === 'true' ? 'approved' : 'disabled-until-provider-approval',
    sourceTypes: PAYMENT_SOURCE_TYPES,
    statuses: PAYMENT_STATUSES,
  });
}
