// EKODI-FUNDING-008 — 에코디 펀딩 2단계 준비: 토스페이먼츠 정산지급대행(지급대행) 연동.
//
// 회원이 개설한 펀딩의 후원금은 에코디비즈 결제 매출로 정산되므로, 개설자에게 돌려주려면
// 토스 '정산지급대행'(셀러 등록 → 지급 요청)을 써야 한다(오픈마켓은 직접 정산 불가).
// 이 모듈은 계약 전 상태에서 '닫힌 채로' 준비된다:
//   • FUNDING_PAYOUT_ENABLED 가 "true" 이고 API 시크릿·보안 키가 모두 있어야만 토스를 호출한다.
//   • 계좌번호는 에코디에 저장하지 않는다. 토스로 곧바로 전달하고 끝 4자리만 남긴다.
//   • 지급은 운영자가 승인한 정산 건만, 펀딩당 1회(refPayoutId 고정)로 요청한다.
// 토스 문서(2026-11-22 확인): 지급대행 POST 본문은 보안 키(64자 16진수)로 JWE(alg=dir, enc=A256GCM,
// 헤더 iat·nonce) 암호화, 응답도 암호화. 엔드포인트 /v2/sellers, /v2/payouts, /v2/balances.
// 확인필요: 암호화 모드를 알리는 요청 헤더 이름(아래 SECURITY_MODE_HEADER)은 샌드박스에서 검증 후 개통.

export const TOSS_API = 'https://api.tosspayments.com';
export const SECURITY_MODE_HEADER = 'TossPayments-api-security-mode'; // 확인필요
export const SELLER_PAYABLE = Object.freeze(['PARTIALLY_APPROVED', 'APPROVED']);
export const SELLER_STATUS_LABEL = Object.freeze({
  APPROVAL_REQUIRED: '본인 확인 대기', PARTIALLY_APPROVED: '지급 가능(주 1천만원 한도)', KYC_REQUIRED: '고객확인(KYC) 필요', APPROVED: '지급 가능',
});
export const PAYOUT_STATUS_LABEL = Object.freeze({
  REQUESTED: '지급 요청됨', IN_PROGRESS: '지급 처리 중', COMPLETED: '지급 완료', FAILED: '지급 실패', CANCELED: '취소됨', DELETED: '삭제됨', REJECTED: '반려됨',
});
export const BUSINESS_TYPES = Object.freeze({ INDIVIDUAL: '개인(비사업자)', INDIVIDUAL_BUSINESS: '개인사업자', CORPORATE: '법인사업자' });
// 금융결제원 은행 코드(주요 은행). 토스 문서의 은행 코드표와 같은 2자리/3자리 숫자 코드.
export const BANKS = Object.freeze({
  '004': 'KB국민', '088': '신한', '020': '우리', '081': '하나', '011': 'NH농협', '003': 'IBK기업', '090': '카카오뱅크', '092': '토스뱅크',
  '089': '케이뱅크', '023': 'SC제일', '027': '씨티', '031': '대구(iM)', '032': '부산', '034': '광주', '035': '제주', '037': '전북', '039': '경남',
  '045': '새마을금고', '048': '신협', '071': '우체국', '007': '수협', '012': '지역농축협',
});

const enc = new TextEncoder();
const dec = new TextDecoder();
function b64url(bytes) {
  let s = ''; const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < a.length; i += 1) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(text) {
  const s = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function hexKey(hex) {
  if (!/^[0-9a-fA-F]{64}$/.test(String(hex || ''))) throw Object.assign(new Error('지급대행 보안 키 형식이 올바르지 않습니다(64자 16진수).'), { code: 'PAYOUT_KEY_INVALID' });
  return Uint8Array.from(String(hex).match(/../g), h => parseInt(h, 16));
}
async function aesKey(hex, usage) { return crypto.subtle.importKey('raw', hexKey(hex), { name: 'AES-GCM' }, false, [usage]); }

/** Compact JWE with alg=dir, enc=A256GCM; protected header carries iat (ISO 8601 with offset) and nonce. */
export async function jweEncrypt(payload, securityKeyHex, { now = new Date(), nonce = crypto.randomUUID() } = {}) {
  const kst = new Date(now.getTime() + 9 * 3600_000).toISOString().replace('Z', '+09:00');
  const header = b64url(enc.encode(JSON.stringify({ alg: 'dir', enc: 'A256GCM', iat: kst, nonce })));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(header), tagLength: 128 }, await aesKey(securityKeyHex, 'encrypt'), enc.encode(JSON.stringify(payload))));
  const cipher = sealed.slice(0, sealed.length - 16); const tag = sealed.slice(sealed.length - 16);
  return `${header}..${b64url(iv)}.${b64url(cipher)}.${b64url(tag)}`;
}
export async function jweDecrypt(token, securityKeyHex) {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 5 || parts[1] !== '') throw Object.assign(new Error('암호화 응답 형식이 올바르지 않습니다.'), { code: 'PAYOUT_JWE_INVALID' });
  const [header, , iv, cipher, tag] = parts;
  const h = JSON.parse(dec.decode(unb64url(header)));
  if (h.alg !== 'dir' || h.enc !== 'A256GCM') throw Object.assign(new Error('지원하지 않는 암호화 방식입니다.'), { code: 'PAYOUT_JWE_ALG' });
  const sealed = new Uint8Array([...unb64url(cipher), ...unb64url(tag)]);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(iv), additionalData: enc.encode(header), tagLength: 128 }, await aesKey(securityKeyHex, 'decrypt'), sealed);
  return JSON.parse(dec.decode(plain));
}

const digits = v => String(v ?? '').replace(/\D/g, '');
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
export function maskAccount(accountNumber) { const d = digits(accountNumber); return d.length >= 4 ? `****${d.slice(-4)}` : ''; }

/** Validates the organiser's payout form and builds the Toss seller body. Returns { errors, body, summary }. */
export function sellerRequest(form = {}, { refSellerId, userEmail }) {
  const errors = [];
  const businessType = Object.hasOwn(BUSINESS_TYPES, form.businessType) ? form.businessType : '';
  if (!businessType) errors.push('개인/사업자 구분을 선택해 주세요.');
  const name = text(form.name, 60); const email = text(form.email || userEmail, 254).toLowerCase(); const phone = digits(form.phone);
  if (!name) errors.push(businessType === 'INDIVIDUAL' ? '이름을 입력해 주세요.' : '상호와 대표자 이름을 입력해 주세요.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push('이메일을 확인해 주세요.');
  if (!/^01\d{8,9}$/.test(phone)) errors.push('휴대폰 번호(숫자만)를 확인해 주세요.');
  const bankCode = Object.hasOwn(BANKS, form.bankCode) ? form.bankCode : '';
  const accountNumber = digits(form.accountNumber); const holderName = text(form.holderName, 60);
  if (!bankCode) errors.push('은행을 선택해 주세요.');
  if (accountNumber.length < 8 || accountNumber.length > 20) errors.push('계좌번호(숫자 8~20자리)를 확인해 주세요.');
  if (!holderName) errors.push('예금주를 입력해 주세요.');
  let party;
  if (businessType === 'INDIVIDUAL') party = { individual: { name, email, phone } };
  else {
    const company = text(form.companyName, 60); const bizNo = digits(form.businessRegistrationNumber);
    if (!company) errors.push('상호를 입력해 주세요.');
    if (bizNo.length !== 10) errors.push('사업자등록번호 10자리를 확인해 주세요.');
    party = { company: { name: company, representativeName: name, businessRegistrationNumber: bizNo, email, phone } };
  }
  if (!/^[A-Za-z0-9_-]{7,20}$/.test(refSellerId || '')) errors.push('셀러 식별자를 만들지 못했습니다.');
  const body = { refSellerId, businessType, ...party, account: { bankCode, accountNumber, holderName } };
  // What EKODI keeps: never the full account number.
  const summary = { businessType, displayName: businessType === 'INDIVIDUAL' ? name : text(form.companyName, 60), bankCode, accountMasked: maskAccount(accountNumber), holderName };
  return { errors, body, summary };
}

/** All-or-nothing settlement for a closed campaign. feeBp: platform fee in basis points (null = undecided). */
export function computeSettlement(campaign, feeBp) {
  const gross = Math.max(0, Math.trunc(Number(campaign.raisedAmount) || 0));
  const goalMet = gross >= Number(campaign.goalAmount || 0) && gross > 0;
  const feeDecided = Number.isInteger(feeBp) && feeBp >= 0 && feeBp <= 3000;
  const fee = feeDecided ? Math.floor((gross * feeBp) / 10000) : null;
  return { gross, goalMet, feeBp: feeDecided ? feeBp : null, fee, net: feeDecided ? gross - fee : null };
}

export function payoutConfig(env) {
  const raw = String(env.FUNDING_PLATFORM_FEE_BP ?? '').trim();
  const feeBp = /^\d{1,4}$/.test(raw) ? Number(raw) : null;
  const enabled = String(env.FUNDING_PAYOUT_ENABLED || '').toLowerCase() === 'true' && env.DATA_MODE !== 'isolated-staging'
    && Boolean(env.FUNDING_PAYOUT_SECRET_KEY) && /^[0-9a-fA-F]{64}$/.test(String(env.FUNDING_PAYOUT_SECURITY_KEY || ''));
  const reason = enabled ? '' : String(env.FUNDING_PAYOUT_ENABLED || '').toLowerCase() !== 'true' ? '정산지급대행 계약 전(스위치 꺼짐)' : '지급대행 API 키 미등록';
  return { enabled, feeBp, reason };
}

/** Toss payout client. Every call fails closed when the switch or keys are missing. */
export function createTossPayoutClient(env, fetcher = fetch) {
  const cfg = payoutConfig(env);
  const auth = () => `Basic ${btoa(`${env.FUNDING_PAYOUT_SECRET_KEY}:`)}`;
  async function call(method, path, body) {
    if (!cfg.enabled) throw Object.assign(new Error(`지급대행이 열려 있지 않습니다: ${cfg.reason}`), { code: 'PAYOUT_CLOSED', status: 503 });
    const headers = { authorization: auth() };
    let payload;
    if (body !== undefined) {
      headers['content-type'] = 'text/plain';
      headers[SECURITY_MODE_HEADER] = 'ENCRYPTION';
      payload = await jweEncrypt(body, env.FUNDING_PAYOUT_SECURITY_KEY);
    }
    let response;
    try { response = await fetcher(`${TOSS_API}${path}`, { method, headers, body: payload }); }
    catch { throw Object.assign(new Error('토스 지급대행 서버에 연결하지 못했습니다.'), { code: 'PAYOUT_UNREACHABLE', status: 502 }); }
    const raw = await response.text();
    let data;
    try { data = raw.trim().startsWith('{') ? JSON.parse(raw) : await jweDecrypt(raw, env.FUNDING_PAYOUT_SECURITY_KEY); }
    catch { data = null; }
    if (!response.ok) throw Object.assign(new Error(text(data?.error?.message || data?.message, 200) || `지급대행 요청 실패(${response.status})`), { code: data?.error?.code || data?.code || 'PAYOUT_FAILED', status: response.status });
    return data?.entityBody ?? data;
  }
  return {
    ...cfg,
    registerSeller: body => call('POST', '/v2/sellers', body),
    getSeller: id => call('GET', `/v2/sellers/${encodeURIComponent(id)}`),
    // 확인필요: 토스는 한 번에 최대 100건을 받으며(하나라도 실패하면 전체 실패) 본문을 배열로 받는다고 안내한다.
    // 응답 형태는 샌드박스에서 확인 후 고정한다. 여기서는 배열·items·단건 모두를 받아 첫 건을 돌려준다.
    requestPayout: async item => { const r = await call('POST', '/v2/payouts', [item]); return Array.isArray(r) ? r[0] : Array.isArray(r?.items) ? r.items[0] : r; },
    getPayout: id => call('GET', `/v2/payouts/${encodeURIComponent(id)}`),
  };
}
