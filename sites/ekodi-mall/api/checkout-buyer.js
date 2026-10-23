// EKODI-MALL-TOSS-WIDGET-007 — buyer details and browser checkout config for direct sales.
// Pure helpers so validation and key handling are unit-tested without D1 or Toss.

const clean = (value, max = 500) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export function normalizeMobile(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (!/^01[016789]\d{7,8}$/.test(digits)) return '';
  return digits.length === 11 ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}` : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Validate the buyer block of a public order. Returns { ok, buyer } or { ok:false, errors }. */
export function validateBuyer(input) {
  const b = input && typeof input === 'object' ? input : {};
  const errors = [];
  const name = clean(b.name, 40);
  if (name.length < 2) errors.push('받는 분 이름을 2자 이상 입력해 주세요.');
  const phone = normalizeMobile(b.phone);
  if (!phone) errors.push('휴대전화 번호를 정확히 입력해 주세요.');
  const email = clean(b.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push('이메일 형식이 올바르지 않습니다.');
  const postcode = clean(b.postcode, 10).replace(/[^0-9]/g, '');
  if (!/^\d{5}$/.test(postcode)) errors.push('우편번호 5자리를 입력해 주세요.');
  const address1 = clean(b.address1, 200);
  if (address1.length < 5) errors.push('배송 주소를 입력해 주세요.');
  const address2 = clean(b.address2, 120);
  const memo = clean(b.memo, 200);
  if (b.privacyConsent !== true) errors.push('주문·배송을 위한 개인정보 수집·이용에 동의해 주세요.');
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  return { ok: true, buyer: { name, phone, email, postcode, address1, address2, memo } };
}

export function isWidgetClientKey(key) {
  return /^(test|live)_gck_/.test(clean(key, 200));
}

/** Toss key pair checks shared by readiness and order creation. */
export function tossKeyBlockers(env = {}) {
  const client = clean(env.TOSS_CLIENT_KEY, 200);
  const secret = clean(env.TOSS_SECRET_KEY, 200);
  const blockers = [];
  if (!client) blockers.push('toss-client-key-missing');
  const tossShaped = /^(test|live)_g?ck_/.test(client) && /^(test|live)_g?sk_/.test(secret);
  if (tossShaped) {
    if (client.slice(0, 5) !== secret.slice(0, 5)) blockers.push('toss-key-mode-mismatch');
    if (isWidgetClientKey(client) !== /^(test|live)_gsk_/.test(secret)) blockers.push('toss-key-type-mismatch');
  }
  return blockers;
}

/** What the browser needs to start Toss checkout. The secret key never leaves the server. */
export function checkoutConfig(env, order) {
  const base = clean(env.MALL_BASE_URL, 200).replace(/\/+$/, '') || 'https://ekodi.kr/ekodimall';
  const clientKey = clean(env.TOSS_CLIENT_KEY, 200);
  return {
    provider: 'toss',
    clientKey,
    widget: isWidgetClientKey(clientKey),
    variantKey: clean(env.TOSS_WIDGET_VARIANT_KEY, 60) || 'DEFAULT',
    agreementVariantKey: clean(env.TOSS_WIDGET_AGREEMENT_VARIANT_KEY, 60) || 'AGREEMENT',
    customerKey: 'ANONYMOUS',
    successUrl: `${base}/checkout/success/`,
    failUrl: `${base}/checkout/fail/?orderId=${encodeURIComponent(order.id)}`,
  };
}
