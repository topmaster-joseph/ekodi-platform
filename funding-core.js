// EKODI-FUNDING-001 — 에코디 펀딩 (ekodi.kr/funding) 1단계
//
// 운영 주체: 에코디비즈(EKODIBIZ, 통신판매업 신고 2023-전남무안-0153).
// 1단계 범위 (운영자 결정 2026-11-21):
//  • 누구나 둘러보고 후원할 수 있다(비회원 결제 유지).
//  • 에코디 회원은 기획 스튜디오(/funding/studio)에서 펀딩을 계획·작성·심사 요청할 수 있다.
//  • 공개 모금(결제)은 에코디 소속 조직(에코디비즈·에코디출판)이 받는 펀딩만 연다.
//    다른 개설자의 펀딩은 심사를 통과해도 '정산대행 준비 중'으로 대기한다(2단계: 토스 정산지급대행 계약 후).
//  • 공개 모금 누적 1천만원 이상은 시스템이 차단한다(기부금품법 모집등록 기준선, 모든 유형에 적용).
//  • 결제는 에코디 공통결제(EkodiPayGateway)만 쓴다. 이 모듈은 토스 키를 보지 않는다.
//  • 증권형·대출형은 에코디가 모집하지 않는다(금융위 등록 업종). 안내와 등록업체 연결만 3단계에서 제공한다.
//  • 결제는 FUNDING_PAYMENTS_ENABLED·FUNDING_MID_APPROVED 가 모두 켜지고 게이트웨이가 준비될 때만 열린다(fail closed).

export const PUBLIC_PATH = '/funding';
export const STUDIO_PATH = '/funding/studio';
export const ADMIN_PATH = '/funding/admin';
export const GUIDE_PATH = '/funding/guide';
export const API = '/api/funding';
export const PUBLIC_CAP_KRW = 10_000_000; // 공개 모금은 이 금액 '미만'까지만 받는다.
export const GOAL_MIN = 100_000;
export const GOAL_MAX = PUBLIC_CAP_KRW - 10_000;
export const REWARD_MIN = 1_000;
export const REWARD_MAX = 1_000_000;
export const MAX_DAYS = 90;
export const PENDING_MS = 30 * 60 * 1000;
export const KINDS = Object.freeze({ reward: '후원형(리워드)', donation: '기부형' });
export const FUTURE_KINDS = Object.freeze({ equity: '증권형', loan: '대출형' });
export const PHASE1_ORGS = Object.freeze({ ekodibiz: '에코디비즈', publishing: '에코디출판' });
export const STATUS = Object.freeze({
  draft: '작성 중', review: '심사 중', rejected: '보완 요청', waiting_payout: '정산대행 준비 중',
  live: '모금 중', closed: '종료',
});
export const VISIBLE = Object.freeze(['live', 'waiting_payout', 'closed']);
export const DELIVERY = Object.freeze({ none: '리워드 없음', physical: '실물 배송', digital: '디지털' });
export const BUSINESS = Object.freeze({
  name: '에코디비즈(EKODIBIZ)', owner: '정찬균', bizNo: '213-13-01959', mailOrder: '2023-전남무안-0153',
  address: '전남 무안군 청계면 백련동1길 17-4 1층', email: 'joseph@ekodibiz.kr', phone: '010-3501-8542',
});
export const DEFAULT_REFUND_POLICY = [
  '모금 기간 안에는 언제든 후원을 취소할 수 있으며 전액 환불됩니다.',
  '모금이 끝났을 때 목표 금액에 못 미치면 모든 결제를 취소합니다.',
  '리워드에 하자가 있거나 안내한 일정보다 배송이 늦어지면 받은 날부터 14일 안에 반환을 신청할 수 있습니다.',
  '이미 시중에 판매 중인 상품은 펀딩이 아니라 에코디몰 판매로 안내합니다.',
].join('\n');

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const ORDER = /^FND-[A-Za-z0-9-]{6,58}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function clean(value, max = 4000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '')) && String(value).length <= 254; }
export function won(n) { return `${Math.trunc(Number(n) || 0).toLocaleString('ko-KR')}원`; }
function int(value) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : NaN; }
function randomId(bytes = 8) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
export function newId(prefix) { return `${prefix}_${randomId(8)}`; }
export function newOrderId(now = new Date()) {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  return `FND-${stamp}-${randomId(5)}`;
}
function daysBetween(a, b) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000); }
export function today(now = new Date()) { return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10); } // KST

export function normalizeReward(raw = {}, index = 0) {
  const delivery = Object.hasOwn(DELIVERY, raw.delivery) ? raw.delivery : 'none';
  const limit = raw.limit === '' || raw.limit == null ? 0 : int(raw.limit);
  return {
    id: SLUG.test(String(raw.id || '')) ? String(raw.id) : `r${index + 1}`,
    title: clean(raw.title, 80), description: clean(raw.description, 400),
    amount: int(raw.amount), limit: Number.isFinite(limit) && limit > 0 ? limit : 0,
    delivery, estimatedDelivery: clean(raw.estimatedDelivery, 80),
  };
}

/** Normalizes a studio/admin payload onto an existing campaign. Never touches money counters or status. */
export function normalizeCampaign(body = {}, existing = {}) {
  const pick = (key, max) => (body[key] === undefined ? existing[key] ?? '' : clean(body[key], max));
  const rewards = Array.isArray(body.rewards) ? body.rewards.slice(0, 10).map(normalizeReward) : (existing.rewards || []);
  const seen = new Set();
  rewards.forEach((r, i) => { if (seen.has(r.id)) r.id = `r${i + 1}x`; seen.add(r.id); });
  return {
    ...existing,
    slug: body.slug === undefined ? existing.slug || '' : clean(body.slug, 40).toLowerCase(),
    title: pick('title', 80), summary: pick('summary', 200), story: pick('story', 12000),
    kind: body.kind === undefined ? existing.kind || 'reward' : clean(body.kind, 20),
    organizerName: pick('organizerName', 60), contactEmail: pick('contactEmail', 254).toLowerCase(),
    goalAmount: body.goalAmount === undefined ? existing.goalAmount ?? 0 : int(body.goalAmount),
    startsOn: pick('startsOn', 10), endsOn: pick('endsOn', 10),
    refundPolicy: body.refundPolicy === undefined ? existing.refundPolicy || DEFAULT_REFUND_POLICY : clean(body.refundPolicy, 2000),
    rewards,
  };
}

/** Returns a list of Korean, user-facing problems. Empty list = valid for the requested stage. */
export function validateCampaign(c, { forSubmit = false, digitalApproved = false } = {}) {
  const errors = [];
  if (Object.hasOwn(FUTURE_KINDS, c.kind)) errors.push(`${FUTURE_KINDS[c.kind]} 펀딩은 금융위원회 등록 업종이라 에코디가 직접 모집하지 않습니다. 준비 도구와 등록업체 연결은 3단계에서 제공합니다.`);
  else if (!Object.hasOwn(KINDS, c.kind)) errors.push('펀딩 종류를 선택해 주세요.');
  if (!SLUG.test(c.slug || '')) errors.push('주소 이름은 영문 소문자·숫자·하이픈 3~40자로 정해 주세요.');
  if ((c.title || '').length < 2) errors.push('펀딩 제목을 2자 이상 입력해 주세요.');
  if (!Number.isInteger(c.goalAmount) || c.goalAmount < GOAL_MIN) errors.push(`목표 금액은 ${won(GOAL_MIN)} 이상이어야 합니다.`);
  if (Number.isInteger(c.goalAmount) && c.goalAmount > GOAL_MAX) errors.push(`공개 모금은 ${won(PUBLIC_CAP_KRW)} 미만만 열 수 있습니다(기부금품법 모집등록 기준). 목표를 ${won(GOAL_MAX)} 이하로 정해 주세요.`);
  if (c.contactEmail && !isEmail(c.contactEmail)) errors.push('문의 이메일 형식이 올바르지 않습니다.');
  c.rewards.forEach((r, i) => {
    const label = `${i + 1}번 ${c.kind === 'donation' ? '후원 금액' : '리워드'}`;
    if (!r.title) errors.push(`${label}의 이름을 입력해 주세요.`);
    if (!Number.isInteger(r.amount) || r.amount < REWARD_MIN || r.amount > REWARD_MAX) errors.push(`${label} 금액은 ${won(REWARD_MIN)}~${won(REWARD_MAX)} 사이여야 합니다.`);
    if (c.kind === 'donation' && r.delivery !== 'none') errors.push(`기부형 펀딩에는 대가(리워드)를 둘 수 없습니다. ${label}을 '리워드 없음'으로 바꿔 주세요.`);
  });
  if (forSubmit) {
    if ((c.summary || '').length < 10) errors.push('한 줄 소개를 10자 이상 입력해 주세요.');
    if ((c.story || '').length < 50) errors.push('펀딩 이야기(소개)를 50자 이상 입력해 주세요.');
    if (!c.organizerName) errors.push('개설자(단체) 이름을 입력해 주세요.');
    if (!isEmail(c.contactEmail)) errors.push('후원자가 연락할 문의 이메일을 입력해 주세요.');
    if (!c.rewards.length) errors.push('후원 선택지(리워드 또는 후원 금액)를 1개 이상 만들어 주세요.');
    if (!DATE.test(c.startsOn || '') || !DATE.test(c.endsOn || '')) errors.push('모금 시작일과 종료일을 정해 주세요.');
    else {
      const days = daysBetween(c.startsOn, c.endsOn);
      if (days < 1) errors.push('종료일은 시작일보다 뒤여야 합니다.');
      if (days > MAX_DAYS) errors.push(`모금 기간은 최대 ${MAX_DAYS}일입니다.`);
    }
    if (!(c.refundPolicy || '').trim()) errors.push('반환·환불 정책을 입력해 주세요.');
    const placeholder = [c.title, c.summary, c.story, ...c.rewards.flatMap(r => [r.title, r.description, r.estimatedDelivery])].some(t => String(t || '').includes('[확인필요]'));
    if (placeholder) errors.push("'[확인필요]'로 표시된 자리(도서명·출간 일정 등)를 실제 내용으로 바꿔 주세요.");
    if (!digitalApproved && c.rewards.some(r => r.delivery === 'digital')) errors.push('디지털(무형) 리워드는 무형 상품용 결제 상점이 승인된 뒤에 열 수 있습니다. 지금은 실물 리워드나 리워드 없는 후원으로 구성해 주세요.');
  }
  return errors;
}

export function isOpen(c, now = new Date()) {
  const d = today(now);
  return c.status === 'live' && c.startsOn <= d && d <= c.endsOn;
}
export function progress(c) {
  const pct = c.goalAmount > 0 ? Math.floor((c.raisedAmount / c.goalAmount) * 100) : 0;
  return { pct, capLeft: Math.max(0, PUBLIC_CAP_KRW - 1 - c.raisedAmount) };
}
export function publicView(c, now = new Date()) {
  return {
    slug: c.slug, title: c.title, summary: c.summary, story: c.story, kind: c.kind, kindLabel: KINDS[c.kind] || '',
    organizerName: c.organizerName, contactEmail: c.contactEmail, ownerOrgLabel: PHASE1_ORGS[c.ownerOrg] || '개설자',
    goalAmount: c.goalAmount, raisedAmount: c.raisedAmount, backerCount: c.backerCount, startsOn: c.startsOn, endsOn: c.endsOn,
    refundPolicy: c.refundPolicy, rewards: c.rewards, open: isOpen(c, now), status: c.status, statusLabel: STATUS[c.status], ...progress(c),
  };
}

/* ------------------------------------------------------------------ HTML --- */

const CSS = `:root{--ink:#1b2420;--muted:#5f6b64;--line:#e0e6e2;--bg:#f6f7f5;--brand:#1f6a4b;--accent:#b5652a;--red:#a43636;--w:min(1080px,calc(100% - 28px))}
*{box-sizing:border-box}body{margin:0;font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.65}
a{color:var(--brand)}header.top{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line)}
.wrap{width:var(--w);margin:0 auto}.bar{display:flex;align-items:center;gap:18px;min-height:58px}.bar .brand{font-weight:800;color:var(--ink);text-decoration:none;font-size:18px}
.bar nav{display:flex;gap:14px;margin-left:auto;flex-wrap:wrap}.bar nav a{text-decoration:none;color:var(--muted);font-weight:600}
main{width:var(--w);margin:24px auto 48px}h1{font-size:28px;line-height:1.3;margin:0 0 8px}h2{font-size:20px;margin:28px 0 10px}
.lead{color:var(--muted);margin:0 0 22px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px}.card h3{margin:6px 0;font-size:18px}
.tag{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:99px;background:#e7f1ec;color:var(--brand)}
.tag.warn{background:#fbefe4;color:var(--accent)}.meter{height:8px;border-radius:99px;background:#eceeed;overflow:hidden;margin:10px 0 6px}
.meter i{display:block;height:100%;background:var(--brand)}.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.muted{color:var(--muted);font-size:14px}.notice{border-left:4px solid var(--accent);background:#fff;padding:12px 14px;border-radius:8px;margin:14px 0}
.notice.ok{border-color:var(--brand)}.notice.err{border-color:var(--red)}button,.btn{display:inline-block;border:0;border-radius:10px;background:var(--brand);color:#fff;font-weight:700;padding:10px 16px;cursor:pointer;text-decoration:none;font-size:15px}
button.ghost,.btn.ghost{background:#fff;color:var(--brand);border:1px solid var(--brand)}button:disabled{opacity:.5;cursor:not-allowed}
label{display:block;font-weight:600;margin:12px 0 4px}input,select,textarea{width:100%;padding:9px 10px;border:1px solid #cfd8d3;border-radius:8px;font:inherit;background:#fff}
textarea{min-height:110px}.cols{display:grid;grid-template-columns:2fr 1fr;gap:20px}@media(max-width:820px){.cols{grid-template-columns:1fr}}
.reward{border:1px solid var(--line);border-radius:12px;padding:14px;margin:10px 0;background:#fff}.reward.sel{border-color:var(--brand);box-shadow:0 0 0 2px #cfe5da}
.story{white-space:pre-wrap}table{width:100%;border-collapse:collapse;background:#fff}th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left;font-size:14px;vertical-align:top}
footer.biz{border-top:1px solid var(--line);background:#fff;padding:22px 0;font-size:13px;color:var(--muted)}footer.biz p{margin:4px 0}
.tabs{display:flex;gap:8px;margin:14px 0}.tabs button{background:#fff;color:var(--ink);border:1px solid var(--line)}.tabs button.on{background:var(--brand);color:#fff}
.hide{display:none!important}`;

function shell(title, body, { noindex = false, description = '', scripts = '' } = {}) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>${noindex ? '<meta name="robots" content="noindex,nofollow">' : `<meta name="description" content="${escapeHtml(description || '누구나 후원하고, 에코디 회원은 직접 펀딩을 기획·운영하는 에코디 펀딩')}"><link rel="canonical" href="https://ekodi.kr${PUBLIC_PATH}">`}
<style>${CSS}</style></head><body>
<header class="top"><div class="wrap bar"><a class="brand" href="${PUBLIC_PATH}">에코디 펀딩</a><nav><a href="${PUBLIC_PATH}">펀딩 둘러보기</a><a href="${GUIDE_PATH}">펀딩 안내</a><a href="${STUDIO_PATH}">펀딩 만들기</a></nav></div></header>
${body}
<footer class="biz"><div class="wrap">
<p><b>에코디 펀딩</b> 운영: ${BUSINESS.name} · 대표 ${BUSINESS.owner} · 사업자등록번호 ${BUSINESS.bizNo} · 통신판매업 신고 ${BUSINESS.mailOrder}</p>
<p>${BUSINESS.address} · 문의 ${BUSINESS.email}</p>
<p>에코디비즈는 펀딩 개설자와 후원자를 연결하는 중개자이며, 펀딩의 이행 책임은 각 개설자에게 있습니다. 다만 중개 과정에서 에코디비즈의 고의나 과실로 생긴 손해는 에코디비즈가 책임집니다.</p>
<p>공개 모금은 펀딩마다 ${won(PUBLIC_CAP_KRW)} 미만으로만 운영합니다. 증권형·대출형 모집은 하지 않습니다.</p>
</div></footer>${scripts}</body></html>`;
}

function meter(v) { return `<div class="meter"><i style="width:${Math.min(100, Math.max(0, v.pct))}%"></i></div>`; }

export function renderHome(campaigns = [], now = new Date()) {
  const views = campaigns.map(c => publicView(c, now));
  const cards = views.map(v => `<article class="card"><span class="tag">${escapeHtml(v.kindLabel)}</span> <span class="tag ${v.open ? '' : 'warn'}">${v.open ? '모금 중' : escapeHtml(v.statusLabel === '모금 중' ? '모금 기간 아님' : v.statusLabel)}</span>
<h3><a href="${PUBLIC_PATH}/c/${escapeHtml(v.slug)}">${escapeHtml(v.title)}</a></h3><p class="muted">${escapeHtml(v.summary)}</p>${meter(v)}
<div class="row muted"><span><b>${v.pct}%</b> · ${won(v.raisedAmount)}</span><span>~ ${escapeHtml(v.endsOn)}</span></div><p class="muted">${escapeHtml(v.organizerName)}</p></article>`).join('');
  return shell('에코디 펀딩 · 누구나 후원하고 함께 만드는 펀딩', `<main>
<h1>에코디 펀딩</h1><p class="lead">누구나 둘러보고 후원할 수 있습니다. 에코디 회원은 직접 펀딩을 기획하고 운영할 수 있습니다.</p>
<div class="row"><a class="btn" href="${STUDIO_PATH}">내 펀딩 만들기</a><a class="btn ghost" href="${GUIDE_PATH}">펀딩 종류와 규칙 보기</a></div>
<h2>진행 중인 펀딩</h2>${cards ? `<div class="grid">${cards}</div>` : '<div class="card">곧 첫 펀딩이 열립니다. 조금만 기다려 주세요.</div>'}
</main>`);
}

export function renderGuide() {
  return shell('펀딩 안내 · 에코디 펀딩', `<main><h1>펀딩 종류와 규칙</h1><p class="lead">에코디 펀딩은 법이 허락하는 범위 안에서, 개설자와 후원자 모두를 지키는 방식으로 운영합니다.</p>
<table><tr><th>종류</th><th>에코디에서</th><th>안내</th></tr>
<tr><td>후원형(리워드)</td><td>지금 이용 가능</td><td>후원한 금액에 맞는 리워드(책·상품·행사 등)를 받습니다. 이미 시중에 팔리는 상품은 펀딩이 아니라 에코디몰에서 판매합니다.</td></tr>
<tr><td>기부형</td><td>지금 이용 가능</td><td>대가 없이 돕는 모금입니다. 불특정 다수에게 1천만원 이상을 모으려면 기부금품법에 따른 모집등록이 필요하므로, 에코디는 공개 모금을 1천만원 미만으로 제한합니다.</td></tr>
<tr><td>증권형</td><td>준비 중(3단계)</td><td>금융위원회에 등록한 온라인소액투자중개업자만 모집할 수 있습니다. 에코디는 사업계획 준비를 돕고 등록업체로 연결합니다.</td></tr>
<tr><td>대출형</td><td>준비 중(3단계)</td><td>온라인투자연계금융업자로 등록한 회사만 중개할 수 있습니다. 에코디는 모집하지 않습니다.</td></tr></table>
<h2>펀딩을 열려면</h2><ol><li>에코디 계정으로 로그인해 <a href="${STUDIO_PATH}">펀딩 만들기</a>에서 계획서를 작성합니다.</li><li>심사를 요청하면 에코디비즈가 내용과 반환 정책을 확인합니다.</li><li>지금(1단계)은 에코디 소속 조직의 펀딩부터 공개 모금을 엽니다. 회원 개인·단체의 펀딩은 후원금 정산 대행 계약이 끝나는 대로 순서대로 열립니다.</li></ol>
<h2>후원자 보호</h2><p class="story">${escapeHtml(DEFAULT_REFUND_POLICY)}</p></main>`, { description: '에코디 펀딩의 종류(후원형·기부형·증권형·대출형)와 개설 절차, 후원자 보호 규칙' });
}

export function renderCampaign(c, { now = new Date(), payment = { ready: false } } = {}) {
  const v = publicView(c, now);
  const rewards = v.rewards.map(r => `<div class="reward" data-reward="${escapeHtml(r.id)}"><div class="row"><b>${escapeHtml(r.title)}</b><b>${won(r.amount)}</b></div>
<p class="muted">${escapeHtml(r.description)}</p><p class="muted">${escapeHtml(DELIVERY[r.delivery])}${r.estimatedDelivery ? ` · ${escapeHtml(r.estimatedDelivery)}` : ''}${r.limit ? ` · ${r.limit}개 한정` : ''}</p>
${v.open ? `<button type="button" data-pick="${escapeHtml(r.id)}">이것으로 후원</button>` : ''}</div>`).join('');
  const closedNote = !v.open ? `<div class="notice">${v.status === 'waiting_payout' ? '심사를 통과했고, 후원금 정산 준비가 끝나면 결제가 열립니다.' : v.status === 'live' ? `모금 기간(${escapeHtml(v.startsOn)} ~ ${escapeHtml(v.endsOn)})이 아닙니다.` : `지금은 ${escapeHtml(v.statusLabel)} 상태입니다.`}</div>` : '';
  const payNote = v.open && !payment.ready ? '<div class="notice">결제 연결을 마무리하고 있습니다. 아래에 이메일을 남기시면 결제가 열릴 때 알려 드립니다.</div>' : '';
  const form = `<form id="pledge" class="card hide"><h3>후원 정보</h3><p class="muted" id="pickLabel"></p>
<label for="pName">이름</label><input id="pName" maxlength="60" required autocomplete="name">
<label for="pEmail">이메일</label><input id="pEmail" type="email" maxlength="254" required autocomplete="email">
<label for="pPhone">휴대폰 (리워드 배송 안내용)</label><input id="pPhone" maxlength="20" autocomplete="tel">
<label><input type="checkbox" id="pAgree" required style="width:auto"> 반환·환불 정책과 개인정보 수집(이름·이메일·휴대폰, 펀딩 종료 후 리워드 이행 완료까지 보관)에 동의합니다.</label>
<button id="pGo" type="submit">결제하기</button><p id="pMsg" class="muted"></p></form>`;
  const interest = `<form id="interest" class="card"><h3>소식 받기</h3><p class="muted">이 펀딩의 결제 시작·마감 소식을 이메일로 받습니다.</p>
<input id="iEmail" type="email" maxlength="254" placeholder="이메일" required><label><input type="checkbox" id="iAgree" required style="width:auto"> 이 펀딩 소식을 받기 위한 이메일 수집에 동의합니다(펀딩 종료 시 삭제).</label><button type="submit">알림 신청</button><p id="iMsg" class="muted"></p></form>`;
  const client = `${inline(campaignClient, JSON.stringify({ slug: v.slug, api: API, pay: Boolean(payment.ready) }))}${payment.ready ? '<script src="https://js.tosspayments.com/v2/standard"></script>' : ''}`;
  return shell(`${v.title} · 에코디 펀딩`, `<main><span class="tag">${escapeHtml(v.kindLabel)}</span>
<h1>${escapeHtml(v.title)}</h1><p class="lead">${escapeHtml(v.summary)}</p>
<div class="cols"><section><div class="card story">${escapeHtml(v.story)}</div><h2>반환·환불 정책</h2><div class="card story">${escapeHtml(v.refundPolicy)}</div>
<p class="muted">개설: ${escapeHtml(v.organizerName)} (${escapeHtml(v.ownerOrgLabel)}) · 문의 <a href="mailto:${escapeHtml(v.contactEmail)}">${escapeHtml(v.contactEmail)}</a></p></section>
<aside><div class="card"><b style="font-size:24px">${won(v.raisedAmount)}</b><p class="muted">목표 ${won(v.goalAmount)} · ${v.pct}% · 후원자 ${v.backerCount}명</p>${meter(v)}
<p class="muted">모금 기간 ${escapeHtml(v.startsOn)} ~ ${escapeHtml(v.endsOn)}</p></div>${closedNote}${payNote}
<h2>${v.kind === 'donation' ? '후원 금액' : '리워드'} 선택</h2>${rewards}${v.open && payment.ready ? form : v.status === 'closed' ? '' : interest}</aside></div></main>`, { description: v.summary, scripts: client });
}

export function renderResult(ok, message, slug = '') {
  return shell(ok ? '후원 완료 · 에코디 펀딩' : '결제 안내 · 에코디 펀딩', `<main><h1>${ok ? '후원해 주셔서 고맙습니다' : '결제가 완료되지 않았습니다'}</h1>
<div class="notice ${ok ? 'ok' : 'err'}" id="resultMsg">${escapeHtml(message)}</div><p><a class="btn ghost" href="${PUBLIC_PATH}${slug ? `/c/${escapeHtml(slug)}` : ''}">펀딩으로 돌아가기</a></p></main>`, { noindex: true });
}

export function renderSuccessShell(slug) {
  return shell('후원 확인 중 · 에코디 펀딩', `<main><h1>후원을 확인하고 있습니다</h1><div class="notice" id="resultMsg">잠시만 기다려 주세요…</div>
<p><a class="btn ghost" href="${PUBLIC_PATH}/c/${escapeHtml(slug)}">펀딩으로 돌아가기</a></p></main>`, { noindex: true, scripts: `${inline(successClient, JSON.stringify({ api: API }))}` });
}

/* ------------------------------------------------------------ Client code --- */

// Wrangler bundles with esbuild keep-names, which injects __name(...) calls into these functions.
// They are shipped to the browser via toString(), so every inline script carries the same helper.
export const NAME_PRELUDE = 'const __name=(t,v)=>Object.defineProperty(t,"name",{value:v,configurable:true});';
function inline(fn, arg) { return `<script>{${NAME_PRELUDE}(${fn.toString()})(${arg})}</script>`; }

function campaignClient(cfg) {
  const $ = id => document.getElementById(id);
  let picked = '';
  async function post(path, body) {
    const r = await fetch(cfg.api + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || '처리하지 못했습니다.');
    return d;
  }
  document.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    picked = b.dataset.pick;
    document.querySelectorAll('.reward').forEach(n => n.classList.toggle('sel', n.dataset.reward === picked));
    const form = $('pledge') || $('interest'); form.classList.remove('hide');
    if ($('pickLabel')) $('pickLabel').textContent = '선택: ' + b.closest('.reward').querySelector('b').textContent;
    form.scrollIntoView({ behavior: 'smooth' });
  });
  if ($('interest')) $('interest').onsubmit = async e => {
    e.preventDefault();
    try { const d = await post(`/public/campaigns/${cfg.slug}/interest`, { email: $('iEmail').value, agree: $('iAgree').checked }); $('iMsg').textContent = d.message; }
    catch (x) { $('iMsg').textContent = x.message; }
  };
  if ($('pledge')) $('pledge').onsubmit = async e => {
    e.preventDefault(); $('pGo').disabled = true; $('pMsg').textContent = '결제를 준비하고 있습니다…';
    try {
      const o = await post(`/public/campaigns/${cfg.slug}/pledge`, { rewardId: picked, name: $('pName').value, email: $('pEmail').value, phone: $('pPhone').value, agree: $('pAgree').checked });
      const toss = window.TossPayments(o.clientKey);
      await toss.payment({ customerKey: 'ANONYMOUS' }).requestPayment({ method: 'CARD', amount: { currency: 'KRW', value: o.amount }, orderId: o.orderId, orderName: o.orderName, customerName: o.customerName, customerEmail: o.customerEmail, successUrl: o.successUrl, failUrl: o.failUrl });
    } catch (x) { $('pMsg').textContent = x.message || '결제를 시작하지 못했습니다.'; $('pGo').disabled = false; }
  };
}

function successClient(cfg) {
  const q = new URLSearchParams(location.search);
  const out = document.getElementById('resultMsg');
  fetch(cfg.api + '/public/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paymentKey: q.get('paymentKey'), orderId: q.get('orderId'), amount: Number(q.get('amount')) }) })
    .then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      out.textContent = ok ? `${d.message} (후원번호 ${d.orderId})` : (d.error || '결제를 확인하지 못했습니다.');
      out.className = 'notice ' + (ok ? 'ok' : 'err');
      history.replaceState(null, '', location.pathname);
    }).catch(() => { out.textContent = '결제 확인 중 연결이 끊겼습니다. 결제 내역이 있으면 문의 메일로 알려 주세요.'; });
}

function authClientHelpers() {
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const SESSION_KEY = 'ekodi-funding-session';
  function stored() { try { const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); return v?.accessToken ? v : null; } catch { return null; } }
  function central() {
    try { const v = JSON.parse(localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token') || 'null'); if (v?.access_token && (!v.expires_at || v.expires_at > Date.now() / 1000 + 60)) return { accessToken: v.access_token }; } catch {}
    try { const t = sessionStorage.getItem('ekodi-auth-token'); if (t) return { accessToken: t }; } catch {}
    return null;
  }
  async function session() {
    const params = new URLSearchParams(location.hash.slice(1)); const hash = params.get('ekodi_token');
    if (!hash) return stored() || central();
    const r = await fetch(SUPABASE_URL + '/auth/v1/verify', { method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ token_hash: hash, type: params.get('ekodi_type') || 'email' }) });
    const d = await r.json().catch(() => ({})); if (!r.ok || !d.access_token) throw new Error('로그인 연결에 실패했습니다.');
    const v = { accessToken: d.access_token }; sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)); history.replaceState(null, '', location.pathname + location.search); return v;
  }
  function login() { const u = new URL('https://ekodi.kr/auth/'); u.searchParams.set('site', 'funding'); u.searchParams.set('return_to', location.origin + location.pathname); location.href = u.href; }
  function forget() { sessionStorage.removeItem(SESSION_KEY); }
  return { session, login, forget };
}

function studioClient(cfg) {
  const auth = (cfg.helpers)();
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wonf = n => (Math.trunc(Number(n) || 0)).toLocaleString('ko-KR') + '원';
  let token = ''; let me = null; let list = []; let editing = null;
  async function api(path, options = {}) {
    const r = await fetch(cfg.api + path, { ...options, cache: 'no-store', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { auth.forget(); auth.login(); throw new Error('로그인이 필요합니다.'); }
    if (!r.ok) throw Object.assign(new Error(d.error || '처리하지 못했습니다.'), { data: d });
    return d;
  }
  function say(t, type = '') { $('state').textContent = t; $('state').className = 'notice ' + type; }
  function rewardRow(r = {}) {
    const div = document.createElement('div'); div.className = 'reward';
    div.innerHTML = `<div class="cols"><div><label>이름</label><input data-k="title" maxlength="80" value="${esc(r.title)}"><label>설명</label><input data-k="description" maxlength="400" value="${esc(r.description)}"></div>
<div><label>금액(원)</label><input data-k="amount" type="number" min="1000" step="1000" value="${esc(r.amount)}"><label>전달 방식</label><select data-k="delivery">${Object.entries(cfg.delivery).map(([k, v]) => `<option value="${k}"${r.delivery === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
<label>수량 한정(0=무제한)</label><input data-k="limit" type="number" min="0" value="${esc(r.limit || 0)}"><label>예상 전달 시기</label><input data-k="estimatedDelivery" maxlength="80" value="${esc(r.estimatedDelivery)}"></div></div>
<input type="hidden" data-k="id" value="${esc(r.id)}"><button type="button" class="ghost" data-del>삭제</button>`;
    div.querySelector('[data-del]').onclick = () => div.remove();
    $('rewards').appendChild(div);
  }
  function fill(c = {}) {
    editing = c.id || null;
    for (const k of ['slug', 'title', 'summary', 'story', 'organizerName', 'contactEmail', 'goalAmount', 'startsOn', 'endsOn', 'refundPolicy']) $('f_' + k).value = c[k] ?? '';
    $('f_kind').value = c.kind || 'reward';
    if (!c.refundPolicy) $('f_refundPolicy').value = cfg.refund;
    $('rewards').innerHTML = ''; (c.rewards?.length ? c.rewards : [{}]).forEach(rewardRow);
    const locked = c.status && !['draft', 'rejected'].includes(c.status);
    document.querySelectorAll('#form input,#form select,#form textarea,#form button').forEach(n => n.disabled = Boolean(locked));
    $('formTitle').textContent = editing ? `편집: ${c.title || ''} (${cfg.status[c.status] || ''})` : '새 펀딩 계획서';
    $('reviewNote').textContent = c.reviewNote ? '심사 의견: ' + c.reviewNote : '';
    $('btnSubmit').classList.toggle('hide', !editing); $('btnWithdraw').classList.toggle('hide', c.status !== 'review');
    $('btnWithdraw').disabled = false; $('editor').classList.remove('hide');
  }
  function collect() {
    const body = {}; for (const k of ['slug', 'title', 'summary', 'story', 'organizerName', 'contactEmail', 'goalAmount', 'startsOn', 'endsOn', 'refundPolicy', 'kind']) body[k] = $('f_' + k).value;
    body.goalAmount = Number(body.goalAmount);
    body.rewards = [...document.querySelectorAll('#rewards .reward')].map(n => Object.fromEntries([...n.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.type === 'number' ? Number(i.value) : i.value])));
    if (me?.isOperator) body.ownerOrg = $('f_ownerOrg').value;
    return body;
  }
  function render() {
    $('mine').innerHTML = list.length ? `<table><tr><th>펀딩</th><th>상태</th><th>목표</th><th>모금</th><th></th></tr>${list.map(c => `<tr><td>${esc(c.title)}<br><span class="muted">/funding/c/${esc(c.slug)}</span></td><td>${esc(cfg.status[c.status])}</td><td>${wonf(c.goalAmount)}</td><td>${wonf(c.raisedAmount)}</td><td><button class="ghost" data-open="${esc(c.id)}">열기</button></td></tr>`).join('')}</table>` : '<p class="muted">아직 만든 펀딩이 없습니다.</p>';
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => fill(list.find(c => c.id === b.dataset.open)));
  }
  async function load() { list = (await api('/studio/campaigns')).campaigns || []; render(); }
  async function save(e) {
    e?.preventDefault?.();
    try {
      const body = collect();
      const d = editing ? await api('/studio/campaigns/' + editing, { method: 'PUT', body: JSON.stringify(body) }) : await api('/studio/campaigns', { method: 'POST', body: JSON.stringify(body) });
      await load(); fill(d.campaign); say(d.warnings?.length ? '저장했습니다. 심사 요청 전에 확인할 점: ' + d.warnings.join(' / ') : '저장했습니다.', d.warnings?.length ? '' : 'ok');
    } catch (x) { say(x.message + (x.data?.errors ? ' — ' + x.data.errors.join(' / ') : ''), 'err'); }
  }
  async function act(path, confirmText) {
    if (confirmText && !confirm(confirmText)) return;
    try { await save(); const d = await api(`/studio/campaigns/${editing}/${path}`, { method: 'POST', body: '{}' }); await load(); fill(d.campaign); say(d.message, 'ok'); }
    catch (x) { say(x.message + (x.data?.errors ? ' — ' + x.data.errors.join(' / ') : ''), 'err'); }
  }
  (async () => {
    try {
      const s = await auth.session(); if (!s?.accessToken) { $('loginBox').classList.remove('hide'); say('펀딩을 만들려면 에코디 계정으로 로그인해 주세요.'); return; }
      token = s.accessToken; me = await api('/studio/me');
      $('who').textContent = me.email + (me.isOperator ? ' · 운영자' : ' · 에코디 회원');
      $('ownerBox').classList.toggle('hide', !me.isOperator);
      $('f_ownerOrg').innerHTML = Object.entries(me.orgs).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
      $('btnNew').onclick = () => fill({}); $('btnAddReward').onclick = () => rewardRow({}); $('form').onsubmit = save;
      $('btnSubmit').onclick = () => act('submit', '심사를 요청할까요? 심사 중에는 수정할 수 없습니다.');
      $('btnWithdraw').onclick = () => act('withdraw');
      $('app').classList.remove('hide'); await load(); say('펀딩 계획서를 작성하고 심사를 요청할 수 있습니다.', 'ok');
    } catch (x) { say(x.message, 'err'); }
  })();
  $('loginBtn').onclick = () => auth.login();
}

function adminClient(cfg) {
  const auth = (cfg.helpers)();
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wonf = n => (Math.trunc(Number(n) || 0)).toLocaleString('ko-KR') + '원';
  let token = ''; let list = []; let filter = 'review';
  async function api(path, options = {}) {
    const r = await fetch(cfg.api + path, { ...options, cache: 'no-store', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { auth.forget(); auth.login(); throw new Error('로그인이 필요합니다.'); }
    if (!r.ok) throw Object.assign(new Error(d.error || '처리하지 못했습니다.'), { data: d });
    return d;
  }
  function say(t, type = '') { $('state').textContent = t; $('state').className = 'notice ' + type; }
  function render() {
    document.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === filter));
    const rows = list.filter(c => filter === 'all' || c.status === filter);
    $('list').innerHTML = rows.length ? rows.map(c => `<div class="card" style="margin:10px 0"><div class="row"><b>${esc(c.title)}</b><span class="tag">${esc(cfg.status[c.status])}</span></div>
<p class="muted">${esc(cfg.kinds[c.kind] || c.kind)} · ${esc(cfg.orgs[c.ownerOrg] || '회원 개설')} · ${esc(c.organizerName)} · ${esc(c.organizerEmail)}<br>목표 ${wonf(c.goalAmount)} · 모금 ${wonf(c.raisedAmount)} (${c.backerCount}명) · ${esc(c.startsOn)} ~ ${esc(c.endsOn)} · <a href="/funding/c/${esc(c.slug)}" target="_blank" rel="noopener">미리보기</a></p>
${c.problems?.length ? `<div class="notice err">확인필요: ${c.problems.map(esc).join(' / ')}</div>` : ''}
<details><summary>리워드 ${c.rewards.length}개 · 소개 보기</summary><p class="story">${esc(c.summary)}\n\n${esc(c.story)}</p><ul>${c.rewards.map(r => `<li>${esc(r.title)} · ${wonf(r.amount)} · ${esc(cfg.delivery[r.delivery])}${r.limit ? ` · ${r.limit}개` : ''}</li>`).join('')}</ul></details>
<input placeholder="심사 의견(보완 요청 시 필수)" data-note="${esc(c.id)}" maxlength="500" style="margin:8px 0">
<div class="row" style="justify-content:flex-start">${c.status === 'review' ? `<button data-act="approve" data-id="${esc(c.id)}">승인</button><button class="ghost" data-act="reject" data-id="${esc(c.id)}">보완 요청</button>` : ''}
${['live', 'waiting_payout'].includes(c.status) ? `<button class="ghost" data-act="close" data-id="${esc(c.id)}">모금 종료</button>` : ''}<button class="ghost" data-pledges="${esc(c.id)}">후원 내역</button></div><div data-out="${esc(c.id)}"></div></div>`).join('') : '<p class="muted">해당하는 펀딩이 없습니다.</p>';
    document.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      const id = b.dataset.id; const note = document.querySelector(`[data-note="${id}"]`).value;
      const labels = { approve: '승인하면 시작일부터 공개 모금이 열립니다(결제가 준비된 경우). 승인할까요?', reject: '보완을 요청할까요?', close: '모금을 지금 종료할까요? 되돌릴 수 없습니다.' };
      if (!confirm(labels[b.dataset.act])) return;
      try { const d = await api(`/admin/campaigns/${id}/${b.dataset.act}`, { method: 'POST', body: JSON.stringify({ note }) }); say(d.message, 'ok'); await load(); }
      catch (x) { say(x.message + (x.data?.errors ? ' — ' + x.data.errors.join(' / ') : ''), 'err'); }
    });
    document.querySelectorAll('[data-pledges]').forEach(b => b.onclick = async () => {
      const d = await api(`/admin/campaigns/${b.dataset.pledges}/pledges`);
      document.querySelector(`[data-out="${b.dataset.pledges}"]`).innerHTML = d.pledges.length ? `<table><tr><th>후원번호</th><th>후원자</th><th>리워드</th><th>금액</th><th>상태</th><th>일시</th></tr>${d.pledges.map(p => `<tr><td>${esc(p.id)}</td><td>${esc(p.backerName)}<br>${esc(p.backerEmail)} ${esc(p.backerPhone)}</td><td>${esc(p.rewardTitle)}</td><td>${wonf(p.amount)}</td><td>${esc(p.status)}</td><td>${esc(p.createdAt)}</td></tr>`).join('')}</table>` : '<p class="muted">후원 내역이 없습니다.</p>';
    });
  }
  async function load() { const d = await api('/admin/campaigns'); list = d.campaigns || []; $('payState').textContent = d.payment.ready ? `결제 열림 (${d.payment.mode})` : `결제 닫힘 — ${d.payment.reason}`; render(); }
  (async () => {
    try {
      const s = await auth.session(); if (!s?.accessToken) { auth.login(); return; }
      token = s.accessToken; const me = await api('/admin/me'); $('who').textContent = me.email + ' · 운영자';
      document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(); });
      $('app').classList.remove('hide'); await load(); say('심사 대기 펀딩을 확인하세요.', 'ok');
    } catch (x) { say(x.message, 'err'); }
  })();
}

export function renderStudio() {
  const cfg = { api: API, delivery: DELIVERY, status: STATUS, refund: DEFAULT_REFUND_POLICY };
  const kindOptions = Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('') + Object.entries(FUTURE_KINDS).map(([k, v]) => `<option value="${k}" disabled>${v} (3단계 준비 중)</option>`).join('');
  return shell('펀딩 만들기 · 에코디 펀딩', `<main><h1>펀딩 만들기</h1><p class="lead">에코디 회원이면 누구나 펀딩을 계획하고 심사를 요청할 수 있습니다. <span id="who" class="muted"></span></p>
<div id="state" class="notice">로그인 상태를 확인하고 있습니다…</div><div id="loginBox" class="hide"><button id="loginBtn">에코디 계정으로 로그인</button></div>
<div id="app" class="hide"><div class="row"><h2>내 펀딩</h2><button id="btnNew">새 펀딩 계획서</button></div><div id="mine"></div>
<div id="editor" class="card hide" style="margin-top:18px"><h2 id="formTitle">새 펀딩 계획서</h2><p id="reviewNote" class="muted"></p>
<form id="form"><div class="cols"><div>
<label for="f_title">펀딩 제목</label><input id="f_title" maxlength="80" required>
<label for="f_summary">한 줄 소개</label><input id="f_summary" maxlength="200">
<label for="f_story">펀딩 이야기 (왜, 무엇을, 어떻게)</label><textarea id="f_story" maxlength="12000" style="min-height:220px"></textarea>
<label for="f_refundPolicy">반환·환불 정책</label><textarea id="f_refundPolicy" maxlength="2000"></textarea></div><div>
<label for="f_kind">펀딩 종류</label><select id="f_kind">${kindOptions}</select>
<div id="ownerBox" class="hide"><label for="f_ownerOrg">모금 주체(운영자 전용)</label><select id="f_ownerOrg"></select></div>
<label for="f_slug">주소 이름 (ekodi.kr/funding/c/…)</label><input id="f_slug" maxlength="40" placeholder="예: new-book-2027">
<label for="f_goalAmount">목표 금액(원, ${won(GOAL_MAX)} 이하)</label><input id="f_goalAmount" type="number" min="${GOAL_MIN}" max="${GOAL_MAX}" step="10000">
<label for="f_startsOn">시작일</label><input id="f_startsOn" type="date"><label for="f_endsOn">종료일 (최대 ${MAX_DAYS}일)</label><input id="f_endsOn" type="date">
<label for="f_organizerName">개설자(단체) 이름</label><input id="f_organizerName" maxlength="60"><label for="f_contactEmail">문의 이메일</label><input id="f_contactEmail" type="email" maxlength="254"></div></div>
<h3>후원 선택지</h3><div id="rewards"></div><button type="button" class="ghost" id="btnAddReward">선택지 추가</button>
<div class="row" style="margin-top:16px;justify-content:flex-start"><button type="submit">저장</button><button type="button" id="btnSubmit" class="hide">심사 요청</button><button type="button" id="btnWithdraw" class="ghost hide">심사 요청 취소</button></div></form>
<p class="muted">공개 모금은 펀딩마다 ${won(PUBLIC_CAP_KRW)} 미만입니다. 1단계에서는 에코디 소속 조직의 펀딩부터 결제가 열리고, 회원 펀딩은 심사 통과 후 정산대행 준비가 끝나는 대로 열립니다.</p></div></div></main>`,
  { noindex: true, scripts: `${inline(studioClient, `{...${JSON.stringify(cfg)},helpers:${authClientHelpers.toString()}}`)}` });
}

export function renderAdmin() {
  const cfg = { api: API, delivery: DELIVERY, status: STATUS, kinds: KINDS, orgs: PHASE1_ORGS };
  const tabs = [['review', '심사 대기'], ['live', '모금 중'], ['waiting_payout', '정산대행 대기'], ['rejected', '보완 요청'], ['closed', '종료'], ['all', '전체']];
  return shell('펀딩 심사·운영 · 에코디 펀딩', `<main><h1>펀딩 심사·운영</h1><p class="lead"><span id="who"></span> · <b id="payState"></b></p>
<div id="state" class="notice">로그인 상태를 확인하고 있습니다…</div><div id="app" class="hide"><div class="tabs">${tabs.map(([k, v]) => `<button data-f="${k}">${v}</button>`).join('')}</div><div id="list"></div></div></main>`,
  { noindex: true, scripts: `${inline(adminClient, `{...${JSON.stringify(cfg)},helpers:${authClientHelpers.toString()}}`)}` });
}

/* ------------------------------------------------------------------- App --- */

const SECURITY = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY',
};
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY, ...extra } });
}
function html(body, status = 200, method = 'GET', extra = {}, cache = 'no-store') {
  return new Response(method === 'HEAD' ? null : body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache, ...SECURITY, ...extra } });
}
async function readJson(request) {
  const text = await request.text();
  if (text.length > 64_000) return null;
  try { return JSON.parse(text || '{}'); } catch { return null; }
}
const same = (a, b) => a.replace(/\/+$/, '') === b;

/**
 * pay: { state(): Promise<{ready, mode, clientKey, profile, reason}>, confirm({paymentKey, orderId, amount}): Promise<toss payment> }
 * authenticate(request): Promise<{data:{userId,email,isOperator}}|{response}>
 */
export function createApp({ store, authenticate, pay, extraHeaders = {}, digitalApproved = false, origin = 'https://ekodi.kr', clock = () => new Date() }) {
  const J = (d, s = 200) => json(d, s, extraHeaders);
  const H = (b, s = 200, m = 'GET', cache = 'no-store') => html(b, s, m, extraHeaders, cache);
  const paymentState = async () => {
    try { return await pay.state(); } catch { return { ready: false, mode: 'none', clientKey: '', reason: '결제 게이트웨이에 연결하지 못했습니다.' }; }
  };
  async function audit(actor, action, target, detail = {}) {
    try { await store.audit({ actor: clean(actor, 254) || 'public', action, target: clean(target, 120), detail: JSON.stringify(detail).slice(0, 2000), createdAt: clock().toISOString() }); } catch { /* audit must not break the flow */ }
  }
  async function session(request) {
    const r = await authenticate(request);
    return r?.data ? { data: r.data } : { response: r?.response || J({ error: '로그인이 필요합니다.' }, 401) };
  }
  async function slugTaken(slug, exceptId) {
    const other = await store.getCampaignBySlug(slug);
    return Boolean(other && other.id !== exceptId);
  }
  function ownView(c) { return { ...c, statusLabel: STATUS[c.status] }; }

  async function studioApi(request, url, parts) {
    const s = await session(request); if (s.response) return s.response; const me = s.data;
    const method = request.method;
    const orgs = me.isOperator ? { ...PHASE1_ORGS, member: '회원 개설' } : { member: '회원 개설' };
    if (parts[0] === 'me' && method === 'GET') return J({ email: me.email, isOperator: Boolean(me.isOperator), orgs });
    if (parts[0] !== 'campaigns') return J({ error: 'not_found' }, 404);
    // Org campaigns (에코디비즈·에코디출판) are operated by platform operators; members see only their own.
    const mine = c => Boolean(c && (c.organizerUserId === me.userId || (c.organizerEmail && c.organizerEmail === me.email) || (me.isOperator && Object.hasOwn(PHASE1_ORGS, c.ownerOrg))));
    if (parts.length === 1 && method === 'GET') return J({ campaigns: (await store.listCampaigns({})).filter(mine).map(ownView) });
    if (parts.length === 1 && method === 'POST') {
      const body = await readJson(request); if (!body) return J({ error: '요청 형식이 올바르지 않습니다.' }, 400);
      const c = normalizeCampaign(body, {});
      const errors = validateCampaign(c, { digitalApproved });
      if (errors.length) return J({ error: '입력 내용을 확인해 주세요.', errors }, 422);
      if (await slugTaken(c.slug)) return J({ error: '이미 쓰고 있는 주소 이름입니다.', errors: ['다른 주소 이름을 정해 주세요.'] }, 409);
      const now = clock().toISOString();
      const ownerOrg = me.isOperator && Object.hasOwn(PHASE1_ORGS, body.ownerOrg) ? body.ownerOrg : 'member';
      const campaign = { ...c, id: newId('fund'), ownerOrg, organizerUserId: me.userId, organizerEmail: me.email, status: 'draft', reviewNote: '', raisedAmount: 0, backerCount: 0, createdAt: now, updatedAt: now };
      await store.createCampaign(campaign); await audit(me.email, 'funding.create', campaign.id, { ownerOrg });
      return J({ campaign: ownView(campaign), warnings: validateCampaign(campaign, { forSubmit: true, digitalApproved }) }, 201);
    }
    const c = await store.getCampaign(parts[1]);
    if (!mine(c)) return J({ error: '펀딩을 찾을 수 없습니다.' }, 404);
    if (parts.length === 2 && method === 'PUT') {
      if (!['draft', 'rejected'].includes(c.status)) return J({ error: '심사 중이거나 공개된 펀딩은 수정할 수 없습니다. 먼저 심사 요청을 취소하거나 운영자에게 문의해 주세요.' }, 409);
      const body = await readJson(request); if (!body) return J({ error: '요청 형식이 올바르지 않습니다.' }, 400);
      const next = normalizeCampaign(body, c);
      if (me.isOperator && Object.hasOwn({ ...PHASE1_ORGS, member: 1 }, body.ownerOrg)) next.ownerOrg = body.ownerOrg;
      const errors = validateCampaign(next, { digitalApproved });
      if (errors.length) return J({ error: '입력 내용을 확인해 주세요.', errors }, 422);
      if (await slugTaken(next.slug, c.id)) return J({ error: '이미 쓰고 있는 주소 이름입니다.' }, 409);
      next.updatedAt = clock().toISOString();
      await store.updateCampaign(c.id, next); await audit(me.email, 'funding.update', c.id);
      return J({ campaign: ownView(next), warnings: validateCampaign(next, { forSubmit: true, digitalApproved }) });
    }
    if (parts.length === 3 && method === 'POST' && parts[2] === 'submit') {
      if (!['draft', 'rejected'].includes(c.status)) return J({ error: '지금은 심사를 요청할 수 없는 상태입니다.' }, 409);
      const errors = validateCampaign(c, { forSubmit: true, digitalApproved });
      if (errors.length) return J({ error: '심사 요청 전에 보완할 점이 있습니다.', errors }, 422);
      const next = { ...c, status: 'review', updatedAt: clock().toISOString() };
      await store.updateCampaign(c.id, { status: 'review', updatedAt: next.updatedAt }); await audit(me.email, 'funding.submit', c.id);
      return J({ campaign: ownView(next), message: '심사를 요청했습니다. 에코디비즈가 확인한 뒤 결과를 알려 드립니다.' });
    }
    if (parts.length === 3 && method === 'POST' && parts[2] === 'withdraw') {
      if (c.status !== 'review') return J({ error: '심사 중인 펀딩만 요청을 취소할 수 있습니다.' }, 409);
      await store.updateCampaign(c.id, { status: 'draft', updatedAt: clock().toISOString() }); await audit(me.email, 'funding.withdraw', c.id);
      return J({ campaign: ownView({ ...c, status: 'draft' }), message: '심사 요청을 취소했습니다. 다시 수정할 수 있습니다.' });
    }
    return J({ error: 'not_found' }, 404);
  }

  async function adminApi(request, url, parts) {
    const s = await session(request); if (s.response) return s.response; const me = s.data;
    if (!me.isOperator) return J({ error: '에코디 펀딩 운영자 권한이 필요합니다.' }, 403);
    const method = request.method;
    if (parts[0] === 'me' && method === 'GET') return J({ email: me.email, role: 'operator' });
    if (parts[0] !== 'campaigns') return J({ error: 'not_found' }, 404);
    if (parts.length === 1 && method === 'GET') {
      const p = await paymentState();
      const campaigns = (await store.listCampaigns({})).map(c => ({ ...ownView(c), problems: validateCampaign(c, { forSubmit: true, digitalApproved }) }));
      return J({ campaigns, payment: { ready: Boolean(p.ready), mode: p.mode || 'none', reason: p.reason || (p.ready ? '' : '결제 미개통') } });
    }
    const c = await store.getCampaign(parts[1]);
    if (!c) return J({ error: '펀딩을 찾을 수 없습니다.' }, 404);
    if (parts[2] === 'pledges' && method === 'GET') return J({ pledges: await store.listPledges(c.id) });
    if (method !== 'POST') return J({ error: 'not_found' }, 404);
    const body = await readJson(request) || {};
    const note = clean(body.note, 500);
    const now = clock().toISOString();
    if (parts[2] === 'approve') {
      if (c.status !== 'review') return J({ error: '심사 중인 펀딩만 승인할 수 있습니다.' }, 409);
      const errors = validateCampaign(c, { forSubmit: true, digitalApproved });
      if (errors.length) return J({ error: '승인 전에 보완이 필요합니다.', errors }, 422);
      const status = Object.hasOwn(PHASE1_ORGS, c.ownerOrg) ? 'live' : 'waiting_payout';
      await store.updateCampaign(c.id, { status, reviewNote: note, approvedBy: me.email, approvedAt: now, updatedAt: now });
      await audit(me.email, 'funding.approve', c.id, { status });
      return J({ status, message: status === 'live' ? `승인했습니다. ${c.startsOn}부터 공개 모금이 열립니다(결제가 준비된 경우).` : '승인했습니다. 회원 개설 펀딩이라 정산대행 계약이 끝나면 공개 모금이 열립니다.' });
    }
    if (parts[2] === 'reject') {
      if (c.status !== 'review') return J({ error: '심사 중인 펀딩만 보완을 요청할 수 있습니다.' }, 409);
      if (!note) return J({ error: '보완 요청 의견을 입력해 주세요.' }, 422);
      await store.updateCampaign(c.id, { status: 'rejected', reviewNote: note, updatedAt: now });
      await audit(me.email, 'funding.reject', c.id);
      return J({ status: 'rejected', message: '보완을 요청했습니다.' });
    }
    if (parts[2] === 'close') {
      if (!['live', 'waiting_payout'].includes(c.status)) return J({ error: '모금 중이거나 대기 중인 펀딩만 종료할 수 있습니다.' }, 409);
      await store.updateCampaign(c.id, { status: 'closed', reviewNote: note || c.reviewNote, updatedAt: now });
      await audit(me.email, 'funding.close', c.id);
      return J({ status: 'closed', message: '모금을 종료했습니다. 목표 미달이면 반환 정책에 따라 결제 취소를 진행해 주세요.' });
    }
    return J({ error: 'not_found' }, 404);
  }

  async function publicApi(request, url, parts) {
    const method = request.method;
    if (parts[0] === 'campaigns' && parts.length === 1 && method === 'GET') {
      return J({ campaigns: (await store.listCampaigns({ statuses: [...VISIBLE] })).map(c => publicView(c, clock())) });
    }
    if (parts[0] === 'campaigns' && parts.length === 2 && method === 'GET') {
      const c = await store.getCampaignBySlug(parts[1]);
      if (!c || !VISIBLE.includes(c.status)) return J({ error: '펀딩을 찾을 수 없습니다.' }, 404);
      return J({ campaign: publicView(c, clock()) });
    }
    if (parts[0] === 'campaigns' && parts[2] === 'interest' && method === 'POST') {
      const c = await store.getCampaignBySlug(parts[1]);
      if (!c || !['live', 'waiting_payout'].includes(c.status)) return J({ error: '펀딩을 찾을 수 없습니다.' }, 404);
      const body = await readJson(request) || {};
      const email = clean(body.email, 254).toLowerCase();
      if (!isEmail(email)) return J({ error: '이메일을 확인해 주세요.' }, 422);
      if (body.agree !== true) return J({ error: '이메일 수집에 동의해 주세요.' }, 422);
      await store.addInterest({ id: newId('fint'), campaignId: c.id, email, consentAt: clock().toISOString() });
      return J({ ok: true, message: '알림 신청이 접수되었습니다. 결제가 열리면 알려 드릴게요.' });
    }
    if (parts[0] === 'campaigns' && parts[2] === 'pledge' && method === 'POST') {
      const now = clock();
      const c = await store.getCampaignBySlug(parts[1]);
      if (c && (c.status === 'waiting_payout' || (c.status === 'live' && !Object.hasOwn(PHASE1_ORGS, c.ownerOrg)))) return J({ error: '이 펀딩은 정산대행 준비가 끝난 뒤 결제가 열립니다.', code: 'PAYOUT_NOT_READY' }, 409);
      if (!c || !isOpen(c, now)) return J({ error: '지금은 후원할 수 없는 펀딩입니다.' }, 409);
      if (!Object.hasOwn(PHASE1_ORGS, c.ownerOrg)) return J({ error: '이 펀딩은 정산대행 준비가 끝난 뒤 결제가 열립니다.', code: 'PAYOUT_NOT_READY' }, 409);
      const p = await paymentState();
      if (!p.ready || !p.clientKey) return J({ error: '결제 연결을 마무리하고 있습니다. 알림 신청을 남겨 주시면 결제가 열릴 때 알려 드립니다.', code: 'PAYMENTS_CLOSED' }, 503);
      const body = await readJson(request) || {};
      const reward = c.rewards.find(r => r.id === body.rewardId);
      if (!reward) return J({ error: '후원 선택지를 골라 주세요.' }, 422);
      const name = clean(body.name, 60); const email = clean(body.email, 254).toLowerCase(); const phone = clean(body.phone, 20).replace(/[^0-9+-]/g, '');
      if (!name || !isEmail(email)) return J({ error: '이름과 이메일을 확인해 주세요.' }, 422);
      if (reward.delivery === 'physical' && phone.replace(/\D/g, '').length < 9) return J({ error: '실물 리워드는 배송 안내를 위해 휴대폰 번호가 필요합니다.' }, 422);
      if (body.agree !== true) return J({ error: '반환·환불 정책과 개인정보 수집에 동의해 주세요.' }, 422);
      if (reward.limit) {
        const used = await store.countRewardCommitted(c.id, reward.id, now.toISOString());
        if (used >= reward.limit) return J({ error: '이 리워드는 모두 소진되었습니다.' }, 409);
      }
      const pending = await store.pendingTotal(c.id, now.toISOString());
      if (c.raisedAmount + pending + reward.amount >= PUBLIC_CAP_KRW) {
        await audit('public', 'funding.cap_blocked', c.id, { amount: reward.amount });
        return J({ error: `이 펀딩은 공개 모금 한도(${won(PUBLIC_CAP_KRW)} 미만)에 도달해 더 이상 후원을 받을 수 없습니다.`, code: 'PUBLIC_CAP' }, 409);
      }
      const orderId = clean(pay.tagOrderId ? pay.tagOrderId(newOrderId(now), p.profile) : newOrderId(now), 64);
      const pledge = { id: orderId, campaignId: c.id, rewardId: reward.id, rewardTitle: reward.title, amount: reward.amount, backerName: name, backerEmail: email, backerPhone: phone, status: 'payment_pending', expiresAt: new Date(now.getTime() + PENDING_MS).toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() };
      await store.createPledge(pledge); await audit(email, 'funding.pledge_created', c.id, { orderId, amount: reward.amount });
      const base = `${origin}${PUBLIC_PATH}/c/${c.slug}`;
      return J({ orderId, amount: reward.amount, orderName: `${c.title} · ${reward.title}`.slice(0, 100), customerName: name, customerEmail: email, clientKey: p.clientKey, successUrl: `${base}/success`, failUrl: `${base}/fail` }, 201);
    }
    if (parts[0] === 'confirm' && method === 'POST') {
      const body = await readJson(request) || {};
      const orderId = clean(body.orderId, 64); const paymentKey = clean(body.paymentKey, 220); const amount = int(body.amount);
      if (!ORDER.test(orderId) || !paymentKey) return J({ error: '결제 정보가 올바르지 않습니다.' }, 400);
      const pledge = await store.getPledge(orderId);
      if (!pledge) return J({ error: '후원 내역을 찾을 수 없습니다.' }, 404);
      if (pledge.status === 'paid') return pledge.paymentKey === paymentKey ? J({ ok: true, orderId, idempotent: true, message: '이미 후원이 완료되었습니다.' }) : J({ error: '이미 다른 결제로 완료된 후원입니다.' }, 409);
      if (pledge.status !== 'payment_pending') return J({ error: '처리할 수 없는 후원 상태입니다. 문의해 주세요.' }, 409);
      if (amount !== pledge.amount) { await audit('payment-provider:toss', 'funding.amount_mismatch', orderId, { amount }); return J({ error: '결제 금액이 후원 금액과 다릅니다.' }, 409); }
      const now = clock();
      if (pledge.expiresAt < now.toISOString()) { await store.updatePledge(orderId, { status: 'expired', updatedAt: now.toISOString() }, 'payment_pending'); return J({ error: '후원 준비 시간이 지났습니다. 다시 시도해 주세요.' }, 409); }
      const campaign = await store.getCampaign(pledge.campaignId);
      if (!campaign || !isOpen(campaign, now)) return J({ error: '모금이 종료되어 결제를 진행하지 않았습니다(청구되지 않았습니다).' }, 409);
      // Reserve under the public cap atomically BEFORE charging; nothing is charged when this fails.
      if (!(await store.reserveRaise(campaign.id, pledge.amount, PUBLIC_CAP_KRW))) {
        await store.updatePledge(orderId, { status: 'cap_blocked', updatedAt: now.toISOString() }, 'payment_pending');
        await audit('system', 'funding.cap_blocked_at_confirm', campaign.id, { orderId });
        return J({ error: `공개 모금 한도(${won(PUBLIC_CAP_KRW)} 미만)에 도달해 결제를 진행하지 않았습니다(청구되지 않았습니다).`, code: 'PUBLIC_CAP' }, 409);
      }
      let payment;
      try { payment = await pay.confirm({ paymentKey, orderId, amount: pledge.amount }); }
      catch (error) {
        await store.releaseRaise(campaign.id, pledge.amount);
        await store.updatePledge(orderId, { status: 'payment_failed', updatedAt: now.toISOString() }, 'payment_pending');
        await audit('payment-provider:toss', 'funding.confirm_failed', orderId, { code: error?.code || '', status: error?.status || 0 });
        return J({ error: clean(error?.message, 200) || '결제를 승인하지 못했습니다.' }, Number(error?.status) >= 400 && Number(error?.status) < 500 ? 400 : 502);
      }
      if (payment?.orderId !== orderId || int(payment?.totalAmount) !== pledge.amount || payment?.status !== 'DONE') {
        await store.releaseRaise(campaign.id, pledge.amount);
        await store.updatePledge(orderId, { status: 'needs_review', paymentKey, updatedAt: now.toISOString() }, 'payment_pending');
        await audit('payment-provider:toss', 'funding.payment_mismatch', orderId, { status: payment?.status, totalAmount: payment?.totalAmount });
        return J({ error: '결제 확인 내용이 맞지 않아 운영자가 확인합니다. 문의 메일로 연락드리겠습니다.' }, 409);
      }
      const changed = await store.updatePledge(orderId, { status: 'paid', paymentKey, method: clean(payment.method, 40), approvedAt: clean(payment.approvedAt, 40) || now.toISOString(), receiptUrl: clean(payment.receipt?.url, 500), updatedAt: now.toISOString() }, 'payment_pending');
      if (!changed) { await store.releaseRaise(campaign.id, pledge.amount); return J({ error: '이미 처리된 후원입니다.' }, 409); }
      await store.incrementBackers(campaign.id);
      await audit(pledge.backerEmail, 'funding.paid', campaign.id, { orderId, amount: pledge.amount });
      return J({ ok: true, orderId, message: '후원이 완료되었습니다. 영수증과 안내는 이메일로 확인해 주세요.' });
    }
    return J({ error: 'not_found' }, 404);
  }

  return async function handle(request) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === API || path.startsWith(`${API}/`)) {
      const parts = path.slice(API.length + 1).split('/').filter(Boolean).map(decodeURIComponent);
      const area = parts.shift();
      if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', ...extraHeaders } });
      if (area === 'studio') return studioApi(request, url, parts);
      if (area === 'admin') return adminApi(request, url, parts);
      if (area === 'public') return publicApi(request, url, parts);
      if (area === 'health' && method === 'GET') return J({ ok: true, service: 'funding', cap: PUBLIC_CAP_KRW });
      return J({ error: 'not_found' }, 404);
    }
    if (!['GET', 'HEAD'].includes(method)) return J({ error: '허용되지 않은 요청입니다.' }, 405);
    if (path === PUBLIC_PATH) return H(renderHome(await store.listCampaigns({ statuses: ['live', 'waiting_payout'] }), clock()), 200, method, 'public, max-age=60');
    if (path === GUIDE_PATH) return H(renderGuide(), 200, method, 'public, max-age=300');
    if (path === STUDIO_PATH) return H(renderStudio(), 200, method);
    if (path === ADMIN_PATH) return H(renderAdmin(), 200, method);
    const m = /^\/funding\/c\/([a-z0-9-]{3,40})(?:\/(success|fail))?$/.exec(path);
    if (m) {
      const c = await store.getCampaignBySlug(m[1]);
      if (!c || !VISIBLE.includes(c.status)) return H(renderResult(false, '펀딩을 찾을 수 없습니다.'), 404, method);
      if (m[2] === 'success') return H(renderSuccessShell(c.slug), 200, method);
      if (m[2] === 'fail') {
        const orderId = clean(url.searchParams.get('orderId'), 64);
        if (ORDER.test(orderId)) await store.updatePledge(orderId, { status: 'payment_failed', updatedAt: clock().toISOString() }, 'payment_pending');
        return H(renderResult(false, clean(url.searchParams.get('message'), 200) || '결제가 취소되었거나 실패했습니다. 청구되지 않았습니다.', c.slug), 200, method);
      }
      return H(renderCampaign(c, { now: clock(), payment: await paymentState() }), 200, method);
    }
    return H(renderResult(false, '페이지를 찾을 수 없습니다.'), 404, method);
  };
}
