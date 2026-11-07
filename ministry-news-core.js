// 사역소식 통합 발행 허브 — 한 번 기록하고, 체크해 골라, 알맞은 대상에게 보낸다.
// Pure logic shared by the production worker, the isolated staging worker and tests.
// No storage, network or secrets live here: callers inject a store, an auth resolver and a mailer.

export const PUBLIC_PATH = '/sosik';
export const SUBSCRIBE_PATH = '/sosik/subscribe';
export const UNSUBSCRIBE_PATH = '/sosik/unsubscribe';
export const ADMIN_PATH = '/sosik/admin';
export const PUBLIC_API = '/api/sosik';
export const ADMIN_API = '/api/sosik/admin';
export const SEND_BATCH = 40;

export const ORGS = Object.freeze({
  church: Object.freeze({
    key: 'church', name: '에코디교회', home: '/ekodichurch',
    footer: '에코디교회 (고유번호 307-82-82097) · 에코디교회로 보내 주신 후원금은 기부금영수증 발급이 가능합니다.',
  }),
  mission: Object.freeze({
    key: 'mission', name: '에코디선교회', home: '/ekodimission',
    footer: '에코디선교회 (고유번호 120-82-72255) · 선교회 후원금은 기부금영수증이 발급되지 않습니다.',
  }),
  shared: Object.freeze({ key: 'shared', name: '에코디교회·에코디선교회 공동', home: '/sosik', footer: '' }),
});
export const CONTACT = Object.freeze({ name: '정찬균 목사', email: 'joseph@ekodi.kr', phone: '010-3501-8542' });

export const KINDS = Object.freeze({ news: '사역소식', activity: '활동', history: '이력', prayer: '기도제목' });
export const VISIBILITY = Object.freeze({
  public: '사이트 공개', partners: '후원자·동역자만', report: '기관 보고 전용', private: '내부 메모(보내지 않음)',
});
const VISIBILITY_RANK = Object.freeze({ public: 0, partners: 1, report: 2, private: 9 });
// The widest visibility a channel may carry.
export const CHANNEL_MAX = Object.freeze({ site: 'public', email: 'partners', web_submit: 'report' });
export const CHANNEL_LABEL = Object.freeze({ site: '사이트 공개', email: '메일 발송', web_submit: '웹 제출' });
export const DISPATCH_KINDS = Object.freeze({ letter: '선교편지', report: '사역보고', prayer: '기도요청' });
export const DISPATCH_STATUS = Object.freeze({
  DRAFT: '초안', APPROVED: '승인됨', PARTIAL: '일부 발송', SENT: '발송 완료',
});

export const SEED_GROUPS = Object.freeze([
  { id: 'church-supporters', org: 'church', name: '교회 후원자', channel: 'email', publicSubscribe: 1, sortOrder: 10, description: '에코디교회 후원자에게 보내는 선교편지' },
  { id: 'mission-supporters', org: 'mission', name: '선교회 후원자', channel: 'email', publicSubscribe: 1, sortOrder: 20, description: '에코디선교회 후원자에게 보내는 선교편지' },
  { id: 'prayer-partners', org: 'shared', name: '기도동역자', channel: 'email', publicSubscribe: 1, sortOrder: 30, description: '교회·선교회 공동 기도편지' },
  { id: 'kfm', org: 'mission', name: '한국외국인선교회', channel: 'web_submit', publicSubscribe: 0, sortOrder: 40, description: '사역보고·기도요청 웹 제출 (제출 주소는 관리화면에서 등록)', submitUrl: '' },
  { id: 'missionfund', org: 'mission', name: '미션펀드', channel: 'web_submit', publicSubscribe: 0, sortOrder: 50, description: '미션펀드 소식지용 사진·기도편지 제출', submitUrl: 'https://missionfund-update.onrender.com/?c=mfchris' },
  { id: 'public-site', org: 'shared', name: '사이트 공개', channel: 'site', publicSubscribe: 0, sortOrder: 60, description: '교회·선교회 사이트와 /sosik 공개 소식' },
]);

export function clean(value, max = 12000) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
export function isEmail(value) {
  return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(String(value || ''));
}
export function newId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
function pick(map, value, fallback) {
  return Object.hasOwn(map, value) ? value : fallback;
}
function safeUrl(value) {
  const text = clean(value, 1000);
  try { const url = new URL(text); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}

export function normalizeItem(body = {}, existing = {}) {
  const photos = (Array.isArray(body.photos) ? body.photos : clean(body.photos ?? (existing.photos || []).join('\n'), 8000).split('\n'))
    .map(safeUrl).filter(Boolean).slice(0, 20);
  return {
    org: pick(ORGS, body.org ?? existing.org, 'shared'),
    kind: pick(KINDS, body.kind ?? existing.kind, 'news'),
    eventDate: /^\d{4}-\d{2}-\d{2}$/.test(clean(body.eventDate ?? existing.eventDate, 10)) ? clean(body.eventDate ?? existing.eventDate, 10) : new Date().toISOString().slice(0, 10),
    title: clean(body.title ?? existing.title, 200),
    summary: clean(body.summary ?? existing.summary, 2000),
    body: clean(body.body ?? existing.body, 20000),
    photos,
    visibility: pick(VISIBILITY, body.visibility ?? existing.visibility, 'partners'),
    status: (body.status ?? existing.status) === 'archived' ? 'archived' : 'active',
  };
}

export function visibilityAllowed(visibility, channel) {
  if (visibility === 'private') return false;
  const max = CHANNEL_MAX[channel];
  if (!max) return false;
  return (VISIBILITY_RANK[visibility] ?? 9) <= VISIBILITY_RANK[max];
}
export function orgCompatible(itemOrOrg, dispatchOrg) {
  return itemOrOrg === 'shared' || itemOrOrg === dispatchOrg;
}

// Which selected items may go to which selected groups, and why not.
export function checkSelection({ org, items, groups }) {
  const problems = [];
  if (!['church', 'mission'].includes(org)) problems.push('보내는 곳(교회 또는 선교회)을 선택해 주세요.');
  if (!items.length) problems.push('보낼 소식을 하나 이상 체크해 주세요.');
  if (!groups.length) problems.push('받는 대상을 하나 이상 선택해 주세요.');
  for (const group of groups) {
    if (!orgCompatible(group.org, org)) problems.push(`「${group.name}」은(는) ${ORGS[group.org]?.name || group.org} 대상이라 이 발송에 넣을 수 없습니다.`);
  }
  for (const item of items) {
    if (!orgCompatible(item.org, org)) problems.push(`「${item.title}」은(는) ${ORGS[item.org]?.name} 소식이라 섞을 수 없습니다.`);
    if (item.status === 'archived') problems.push(`「${item.title}」은(는) 보관된 기록입니다.`);
    for (const group of groups) {
      if (!visibilityAllowed(item.visibility, group.channel)) {
        problems.push(`「${item.title}」(${VISIBILITY[item.visibility]})은(는) 「${group.name}」(${CHANNEL_LABEL[group.channel]})에 보낼 수 없습니다.`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

export function periodLabelFor(items, explicit = '') {
  if (clean(explicit, 80)) return clean(explicit, 80);
  const months = [...new Set(items.map(item => String(item.eventDate || '').slice(0, 7)).filter(Boolean))].sort();
  if (!months.length) return '';
  const fmt = ym => `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`;
  if (months.length === 1) return fmt(months[0]);
  const first = months[0]; const last = months.at(-1);
  return first.slice(0, 4) === last.slice(0, 4) ? `${fmt(first)}–${Number(last.slice(5, 7))}월` : `${fmt(first)}–${fmt(last)}`;
}

function dateText(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return m ? `${Number(m[2])}월 ${Number(m[3])}일` : '';
}
function itemLine(item) {
  const head = `• ${dateText(item.eventDate)} ${item.title}`.replace(/\s+/g, ' ').trim();
  const detail = [item.summary, item.body].filter(Boolean).join('\n  ');
  return detail ? `${head}\n  ${detail}` : head;
}

// Template composition only — no paid AI. The pastor edits the draft before approval.
export function composeDraft({ org, kind, items, periodLabel = '' }) {
  const orgInfo = ORGS[org];
  const period = periodLabelFor(items, periodLabel);
  const sorted = [...items].sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)));
  const prayers = sorted.filter(item => item.kind === 'prayer');
  const stories = sorted.filter(item => item.kind !== 'prayer');
  const label = DISPATCH_KINDS[kind] || DISPATCH_KINDS.letter;
  const subject = `[${orgInfo.name}] ${period ? `${period} ` : ''}${kind === 'report' ? '사역보고 및 기도요청' : label}`;
  const lines = [];
  if (kind === 'report') {
    lines.push(`보고 기관: ${orgInfo.name}`, `보고 기간: ${period || '(기간 입력)'}`, `보고자: ${CONTACT.name} (${CONTACT.email}, ${CONTACT.phone})`, '');
    lines.push('1. 주요 사역 활동');
    lines.push(...(stories.length ? stories.map(itemLine) : ['• (활동 없음)']));
    lines.push('', '2. 기도요청');
    lines.push(...(prayers.length ? prayers.map(itemLine) : ['• (기도제목 없음)']));
  } else {
    lines.push('사랑하는 동역자님께,', '');
    lines.push(`주님의 은혜와 평강을 전합니다. ${period ? `${period} ` : ''}${orgInfo.name}의 사역을 나눕니다.`, '');
    if (stories.length && kind !== 'prayer') { lines.push('■ 사역 소식'); lines.push(...stories.map(itemLine)); lines.push(''); }
    if (prayers.length || kind === 'prayer') { lines.push('■ 함께 기도해 주세요'); lines.push(...(prayers.length ? prayers.map(itemLine) : stories.map(itemLine))); lines.push(''); }
    lines.push('늘 기도와 사랑으로 함께해 주셔서 감사합니다.', '', `${orgInfo.name} ${CONTACT.name} 드림`);
  }
  lines.push('', '—', orgInfo.footer, `문의: ${CONTACT.name} · ${CONTACT.email} · ${CONTACT.phone}`);
  return { subject, body: lines.join('\n'), periodLabel: period };
}

export function letterForRecipient(dispatch, recipient, origin = 'https://ekodi.kr') {
  const link = `${origin}${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(recipient.unsubToken)}`;
  const greeting = recipient.name ? `${recipient.name} 님께\n\n` : '';
  return `${greeting}${dispatch.body}\n\n이 메일은 ${recipient.groupName || '소식'} 수신에 동의하신 분께 보내드립니다.\n더 받지 않으시려면: ${link}`;
}

// Items already delivered to any of the same groups — the "중복 발송 주의" signal.
export function alreadySentMap(dispatches, groupIds) {
  const wanted = new Set(groupIds);
  const map = {};
  for (const dispatch of dispatches) {
    if (!['SENT', 'PARTIAL'].includes(dispatch.status)) continue;
    if (!dispatch.groupIds.some(id => wanted.has(id))) continue;
    for (const itemId of dispatch.itemIds) (map[itemId] ||= []).push({ id: dispatch.id, subject: dispatch.subject, sentAt: dispatch.sentAt });
  }
  return map;
}

export function parseRecipientCsv(text) {
  const rows = []; const rejected = [];
  for (const raw of clean(text, 200000).split('\n')) {
    const line = raw.trim();
    if (!line || /^이름\s*[,\t]/.test(line) || /^name\s*[,\t]/i.test(line)) continue;
    const parts = line.split(/[,\t]/).map(part => part.trim());
    const email = parts.find(isEmail) || '';
    if (!email) { rejected.push(line.slice(0, 120)); continue; }
    const name = parts.find(part => part && part !== email && !/^[0-9+\-\s()]{7,}$/.test(part)) || '';
    const phone = parts.find(part => /^[0-9+\-\s()]{7,}$/.test(part)) || '';
    rows.push({ name: clean(name, 80), email: email.toLowerCase(), phone: clean(phone, 40) });
  }
  return { rows, rejected };
}

/* ------------------------------------------------------------------ HTML ---- */

function page({ title, description = '', body, robots = 'index,follow', canonical = '' }) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${robots}">
${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
<style>
:root{--ink:#15231d;--muted:#5f6d65;--line:#dde6e0;--paper:#f6f9f7;--green:#1f6a4b;--soft:#eaf4ee;--amber:#7a5310;--red:#a43636;--w:min(980px,calc(100% - 28px))}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Pretendard,"Noto Sans KR",system-ui,-apple-system,sans-serif;line-height:1.7}
.top{position:sticky;top:0;z-index:5;background:rgba(246,249,247,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.top>div,.wrap,.foot>div{width:var(--w);margin:0 auto}.top>div{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0}
.brand{font-weight:800;color:inherit;text-decoration:none;letter-spacing:-.03em}.nav{display:flex;gap:6px;flex-wrap:wrap}
.nav a,.btn,button{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:999px;padding:8px 13px;font:inherit;font-size:13px;text-decoration:none;cursor:pointer}
.nav a.on,.btn.primary,button.primary{background:var(--green);border-color:var(--green);color:#fff}button:disabled{opacity:.5;cursor:not-allowed}
.hero{padding:44px 0 22px}.hero h1{font-size:clamp(30px,6vw,48px);letter-spacing:-.05em;line-height:1.15;margin:0 0 10px}.hero p{color:var(--muted);margin:0;max-width:680px}
.tabs{display:flex;gap:6px;margin:18px 0}.cards{display:grid;gap:12px;padding-bottom:40px}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px 20px}.card h2{font-size:19px;margin:6px 0;letter-spacing:-.03em}.card p{margin:6px 0;color:#34433b}
.meta{display:flex;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--muted)}.tag{background:var(--soft);color:var(--green);border-radius:999px;padding:2px 8px;font-weight:700}
.photos{display:flex;gap:8px;overflow-x:auto;margin-top:10px}.photos img{height:120px;border-radius:12px;object-fit:cover}
.empty{padding:36px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:18px;background:#fff}
form.box{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px;display:grid;gap:12px;max-width:560px}
label.f{display:grid;gap:4px;font-size:13px;font-weight:700}label.f input{border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit}
.check{display:flex;gap:8px;align-items:flex-start;font-size:14px}.hp{position:absolute;left:-5000px}
.done{background:var(--soft);border:1px solid #c9ddd1;border-radius:18px;padding:20px}.err{color:var(--red);font-size:13px}
.foot{border-top:1px solid var(--line);margin-top:30px;color:var(--muted);font-size:12px}.foot>div{padding:20px 0}
</style></head><body>${body}</body></html>`;
}

function chrome(active, inner) {
  const nav = [['/sosik', '전체', 'all'], ['/sosik?org=church', '교회', 'church'], ['/sosik?org=mission', '선교회', 'mission'], [SUBSCRIBE_PATH, '소식 받기', 'subscribe']]
    .map(([href, label, key]) => `<a href="${href}"${key === active ? ' class="on"' : ''}>${label}</a>`).join('');
  return `<header class="top"><div><a class="brand" href="/sosik">에코디 사역소식</a><nav class="nav" aria-label="사역소식 메뉴">${nav}</nav></div></header>
<main class="wrap">${inner}</main>
<footer class="foot"><div><strong>에코디교회 · 에코디선교회</strong><br>문의: ${CONTACT.name} · ${CONTACT.email} · ${CONTACT.phone}<br><a href="/ekodichurch">에코디교회</a> · <a href="/ekodimission">에코디선교회</a></div></footer>`;
}

export function publicCard(item) {
  const photos = item.photos?.length ? `<div class="photos">${item.photos.slice(0, 6).map(src => `<img src="${escapeHtml(src)}" alt="" loading="lazy">`).join('')}</div>` : '';
  return `<article class="card"><div class="meta"><span class="tag">${escapeHtml(ORGS[item.org]?.name || '')}</span><span>${escapeHtml(KINDS[item.kind] || '')}</span><time>${escapeHtml(item.eventDate)}</time></div>
<h2>${escapeHtml(item.title)}</h2>${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ''}${item.body ? `<p>${escapeHtml(item.body).replace(/\n/g, '<br>')}</p>` : ''}${photos}</article>`;
}

// Only public-visibility items ever reach this function's output; callers filter, and we filter again.
export function renderPublicFeed(items = [], org = '') {
  const shown = items.filter(item => item.visibility === 'public' && item.status !== 'archived' && (!org || orgCompatible(item.org, org)));
  const scope = org ? ORGS[org]?.name : '에코디교회·에코디선교회';
  return page({
    title: `${org ? `${scope} ` : ''}사역소식 · 에코디`, description: '에코디교회와 에코디선교회의 사역소식을 한곳에서 전합니다.',
    canonical: `https://ekodi.kr/sosik${org ? `?org=${org}` : ''}`,
    body: chrome(org || 'all', `<section class="hero"><h1>${escapeHtml(scope)}<br>사역소식</h1><p>한 번 기록한 사역을 교회와 선교회가 함께 나눕니다. 공개에 동의한 소식만 이곳에 보입니다.</p></section>
<section class="cards" aria-label="사역소식 목록">${shown.map(publicCard).join('') || '<div class="empty">공개된 소식을 준비하고 있습니다.</div>'}</section>`),
  });
}

export function renderSubscribe(groups = []) {
  const options = groups.filter(group => group.channel === 'email' && group.publicSubscribe && group.active)
    .map(group => `<label class="check"><input type="checkbox" name="groups" value="${escapeHtml(group.id)}"> <span><strong>${escapeHtml(group.name)}</strong><br><small>${escapeHtml(group.description || '')}</small></span></label>`).join('');
  return page({
    title: '소식 받기 · 에코디 사역소식', description: '에코디교회·에코디선교회의 선교편지와 기도편지를 메일로 받아보세요.',
    canonical: 'https://ekodi.kr/sosik/subscribe',
    body: chrome('subscribe', `<section class="hero"><h1>선교편지 받기</h1><p>받고 싶은 소식을 고르고 메일 주소를 남겨 주세요. 언제든 메일 하단 링크로 수신을 그만둘 수 있습니다.</p></section>
<form class="box" id="sub"><label class="f">이름<input name="name" maxlength="80" autocomplete="name"></label><label class="f">이메일 (필수)<input name="email" type="email" required maxlength="200" autocomplete="email"></label>
<fieldset style="border:0;padding:0;margin:0;display:grid;gap:10px"><legend style="font-weight:700;font-size:13px;margin-bottom:6px">받을 소식</legend>${options || '<p>지금은 신청을 받고 있지 않습니다.</p>'}</fieldset>
<label class="hp" aria-hidden="true">웹사이트<input name="website" tabindex="-1" autocomplete="off"></label>
<label class="check"><input type="checkbox" name="consent" required> <span>선교편지 발송을 위해 이름과 이메일을 수집·이용하는 데 동의합니다. (수신거부 시까지 보관)</span></label>
<button class="primary" type="submit">신청하기</button><p class="err" id="err" role="alert"></p></form>
<div class="done" id="done" hidden><strong>신청이 정상적으로 접수되었습니다.</strong><p>선택하신 소식을 메일로 보내 드리겠습니다. 문의는 ${CONTACT.name}(${CONTACT.email}, ${CONTACT.phone})께 연락해 주세요.</p></div>
<script>
document.getElementById('sub').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const err=document.getElementById('err');err.textContent='';
const groups=f.getAll('groups');if(!groups.length){err.textContent='받을 소식을 하나 이상 골라 주세요.';return}
const r=await fetch('${PUBLIC_API}/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:f.get('name'),email:f.get('email'),groups,consent:f.get('consent')==='on',website:f.get('website')})}).catch(()=>null);
const d=r?await r.json().catch(()=>({})):{};if(!r||!r.ok){err.textContent=d.error||'신청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';return}
e.target.hidden=true;document.getElementById('done').hidden=false;};
</script>`),
  });
}

export function renderUnsubscribe(token, recipient) {
  const valid = Boolean(recipient);
  return page({
    title: '수신거부 · 에코디 사역소식', robots: 'noindex,nofollow',
    body: chrome('', `<section class="hero"><h1>메일 수신거부</h1><p>${valid ? `「${escapeHtml(recipient.groupName || '사역소식')}」 메일을 더 받지 않으시려면 아래 버튼을 눌러 주세요.` : '링크가 올바르지 않거나 이미 처리되었습니다.'}</p></section>
${valid ? `<form class="box" id="un"><button class="primary" type="submit">수신거부</button><p class="err" id="err" role="alert"></p></form>
<div class="done" id="done" hidden><strong>수신거부가 정상적으로 처리되었습니다.</strong><p>앞으로 이 메일은 보내지 않습니다. 문의: ${CONTACT.name} (${CONTACT.email})</p></div>
<script>document.getElementById('un').onsubmit=async e=>{e.preventDefault();const r=await fetch('${PUBLIC_API}/unsubscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:${JSON.stringify(String(token || ''))}})}).catch(()=>null);
if(!r||!r.ok){document.getElementById('err').textContent='처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';return}e.target.hidden=true;document.getElementById('done').hidden=false;};</script>` : ''}`),
  });
}

export function renderWordExport(dispatch) {
  const body = escapeHtml(dispatch.body).replace(/\n/g, '<br>');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(dispatch.subject)}</title>
<style>body{font-family:"맑은 고딕","Malgun Gothic",sans-serif;font-size:11pt;line-height:1.7}h1{font-size:16pt}</style></head><body><h1>${escapeHtml(dispatch.subject)}</h1><p>${body}</p></body></html>`;
}

/* ----------------------------------------------------------------- Admin ---- */

function adminClient() {
  const API = '/api/sosik/admin';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const SESSION_KEY = 'ekodi-sosik-session';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = { me: null, items: [], groups: [], recipients: [], dispatches: [], selected: new Set(), current: null, tab: 'items', editing: '' };
  let token = '';
  const L = {
    org: { church: '교회', mission: '선교회', shared: '공동' },
    kind: { news: '사역소식', activity: '활동', history: '이력', prayer: '기도제목' },
    vis: { public: '사이트 공개', partners: '후원자·동역자만', report: '기관 보고 전용', private: '내부 메모' },
    status: { DRAFT: '초안', APPROVED: '승인됨', PARTIAL: '일부 발송', SENT: '발송 완료' },
    channel: { site: '사이트 공개', email: '메일', web_submit: '웹 제출' },
  };
  function stored() { try { const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); return v?.accessToken ? v : null; } catch { return null; } }
  function central() {
    try { const v = JSON.parse(localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token') || 'null'); if (v?.access_token && (!v.expires_at || v.expires_at > Date.now() / 1000 + 60)) return { accessToken: v.access_token }; } catch {}
    try { const t = sessionStorage.getItem('ekodi-auth-token'); if (t) return { accessToken: t }; } catch {}
    return null;
  }
  async function handoff() {
    const params = new URLSearchParams(location.hash.slice(1)); const hash = params.get('ekodi_token');
    if (!hash) return stored() || central();
    const r = await fetch(SUPABASE_URL + '/auth/v1/verify', { method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ token_hash: hash, type: params.get('ekodi_type') || 'email' }) });
    const d = await r.json().catch(() => ({})); if (!r.ok || !d.access_token) throw new Error('로그인 연결에 실패했습니다.');
    const v = { accessToken: d.access_token }; sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)); history.replaceState(null, '', location.pathname + location.search); return v;
  }
  function login() { const u = new URL('https://ekodi.kr/auth/'); u.searchParams.set('site', 'church'); u.searchParams.set('return_to', location.origin + location.pathname); location.href = u.href; }
  async function api(path = '', options = {}) {
    const r = await fetch(API + path, { ...options, cache: 'no-store', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(options.headers || {}) } });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { sessionStorage.removeItem(SESSION_KEY); login(); throw new Error('로그인이 필요합니다.'); }
    if (!r.ok) throw Object.assign(new Error(d.error || '처리하지 못했습니다.'), { data: d });
    return d;
  }
  function say(text, type = '') { const n = $('state'); n.textContent = text; n.dataset.type = type; }
  function orgOptions(allowShared = true) { return (state.me?.orgs || []).concat(allowShared ? ['shared'] : []).map(o => `<option value="${o}">${L.org[o]}</option>`).join(''); }
  function tab(name) {
    state.tab = name; document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('primary', b.dataset.tab === name));
    document.querySelectorAll('.pane').forEach(p => { p.hidden = p.id !== 'pane-' + name; }); render();
  }
  function render() { ({ items: renderItems, send: renderSend, people: renderPeople, log: renderLog })[state.tab]?.(); }

  function renderItems() {
    const q = $('q').value.trim().toLowerCase(); const fo = $('fOrg').value; const fk = $('fKind').value;
    const rows = state.items.filter(i => (!fo || i.org === fo) && (!fk || i.kind === fk) && (!q || (i.title + ' ' + i.summary).toLowerCase().includes(q)));
    $('itemList').innerHTML = rows.map(i => `<article class="row${state.selected.has(i.id) ? ' sel' : ''}"><label class="pick"><input type="checkbox" data-pick="${esc(i.id)}"${state.selected.has(i.id) ? ' checked' : ''}${i.visibility === 'private' ? ' disabled title="내부 메모는 보낼 수 없습니다"' : ''}></label>
<div class="grow"><div class="meta"><b>${esc(i.eventDate)}</b> <span class="b">${L.org[i.org]}</span> <span class="b">${L.kind[i.kind]}</span> <span class="b v-${esc(i.visibility)}">${L.vis[i.visibility]}</span>${i.sentCount ? ` <span class="b warn">${i.sentCount}회 발송됨</span>` : ''}</div>
<h3>${esc(i.title)}</h3><p>${esc(i.summary)}</p></div><div class="acts"><button type="button" data-edit="${esc(i.id)}">수정</button><button type="button" class="danger" data-arch="${esc(i.id)}">보관</button></div></article>`).join('') || '<div class="empty">기록이 없습니다. 오른쪽에서 첫 소식을 기록해 보세요.</div>';
    $('pickCount').textContent = state.selected.size ? `${state.selected.size}개 선택됨 → 「보내기」 탭에서 대상 선택` : '보낼 소식을 체크해 고르세요';
    document.querySelectorAll('[data-pick]').forEach(n => n.onchange = () => { n.checked ? state.selected.add(n.dataset.pick) : state.selected.delete(n.dataset.pick); renderItems(); });
    document.querySelectorAll('[data-edit]').forEach(n => n.onclick = () => editItem(n.dataset.edit));
    document.querySelectorAll('[data-arch]').forEach(n => n.onclick = () => archiveItem(n.dataset.arch));
  }
  function resetItemForm() { state.editing = ''; $('itemForm').reset(); $('iOrg').innerHTML = orgOptions(); $('iDate').value = new Date().toISOString().slice(0, 10); $('iVis').value = 'partners'; $('itemTitle').textContent = '새 기록'; }
  function editItem(id) {
    const i = state.items.find(x => x.id === id); if (!i) return; state.editing = id;
    $('iOrg').innerHTML = orgOptions(); $('iOrg').value = i.org; $('iKind').value = i.kind; $('iDate').value = i.eventDate; $('iTitle').value = i.title; $('iSummary').value = i.summary; $('iBody').value = i.body; $('iPhotos').value = (i.photos || []).join('\n'); $('iVis').value = i.visibility;
    $('itemTitle').textContent = '기록 수정'; $('itemForm').scrollIntoView({ behavior: 'smooth' });
  }
  async function archiveItem(id) { const i = state.items.find(x => x.id === id); if (!i || !confirm(`「${i.title}」을(를) 보관할까요? 공개·발송 목록에서 빠집니다.`)) return; await api('/items/' + encodeURIComponent(id), { method: 'DELETE' }); state.selected.delete(id); await loadItems(); say('보관했습니다.', 'ok'); }
  async function saveItem(e) {
    e.preventDefault(); const body = { org: $('iOrg').value, kind: $('iKind').value, eventDate: $('iDate').value, title: $('iTitle').value, summary: $('iSummary').value, body: $('iBody').value, photos: $('iPhotos').value, visibility: $('iVis').value };
    say('저장 중…');
    try { if (state.editing) await api('/items/' + encodeURIComponent(state.editing), { method: 'PUT', body: JSON.stringify(body) }); else await api('/items', { method: 'POST', body: JSON.stringify(body) }); resetItemForm(); await loadItems(); say('저장했습니다.', 'ok'); } catch (x) { say(x.message, 'error'); }
  }

  function renderSend() {
    const picked = state.items.filter(i => state.selected.has(i.id));
    $('sendPicked').innerHTML = picked.map(i => `<li>${esc(i.eventDate)} · ${L.org[i.org]} · ${esc(i.title)} <small>(${L.vis[i.visibility]})</small></li>`).join('') || '<li>「기록」 탭에서 보낼 소식을 먼저 체크해 주세요.</li>';
    $('sOrg').innerHTML = orgOptions(false);
    const org = $('sOrg').value;
    $('sendGroups').innerHTML = state.groups.filter(g => g.active && (g.org === 'shared' || g.org === org)).map(g => `<label class="check"><input type="checkbox" name="sg" value="${esc(g.id)}"> <span><b>${esc(g.name)}</b> <small>${L.channel[g.channel]}${g.channel === 'email' ? ` · ${g.activeCount || 0}명` : ''}</small></span></label>`).join('');
    renderDispatch();
  }
  function renderDispatch() {
    const d = state.current; $('draftBox').hidden = !d; if (!d) return;
    $('dSubject').value = d.subject; $('dBody').value = d.body; $('dStatus').textContent = L.status[d.status] + (d.sentCount ? ` · ${d.sentCount}명 발송` : '') + (d.failedCount ? ` · 실패 ${d.failedCount}` : '');
    const editable = d.status === 'DRAFT'; $('dSubject').disabled = !editable; $('dBody').disabled = !editable;
    $('btnSaveDraft').hidden = !editable; $('btnApprove').hidden = !editable || !state.me.canApprove;
    $('btnSend').hidden = !['APPROVED', 'PARTIAL'].includes(d.status) || !d.groups.some(g => g.channel === 'email');
    $('btnSend').disabled = !state.me.mail; $('mailNote').hidden = state.me.mail;
    $('btnTest').disabled = !state.me.mail;
    $('dWarn').innerHTML = (d.alreadySent || []).map(w => `<li>⚠ ${esc(w)}</li>`).join('');
    $('dSubmit').innerHTML = d.groups.filter(g => g.channel === 'web_submit').map(g => {
      const done = (d.submissions || []).includes(g.id);
      return `<div class="sub"><b>${esc(g.name)}</b> ${g.submitUrl ? `<a class="btn" href="${esc(g.submitUrl)}" target="_blank" rel="noopener">제출 페이지 열기</a>` : '<small>제출 주소 미등록 — 「대상·수신자」 탭에서 등록</small>'} <button type="button" data-copy>본문 복사</button> ${done ? '<span class="b ok">제출 기록됨</span>' : (['APPROVED', 'PARTIAL', 'SENT'].includes(d.status) ? `<button type="button" data-submitted="${esc(g.id)}">제출 완료 기록</button>` : '<small>승인 후 제출</small>')}</div>`;
    }).join('');
    document.querySelectorAll('[data-copy]').forEach(n => n.onclick = async () => { await navigator.clipboard.writeText(d.subject + '\n\n' + d.body); say('본문을 복사했습니다. 제출 페이지에 붙여 넣으세요.', 'ok'); });
    document.querySelectorAll('[data-submitted]').forEach(n => n.onclick = () => act('/submitted', { groupId: n.dataset.submitted }));
    $('btnExport').onclick = async () => { try { const r = await fetch(API + '/dispatches/' + encodeURIComponent(d.id) + '/export', { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' }); if (!r.ok) throw new Error('파일을 만들지 못했습니다.'); const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = d.subject.replace(/[\\/:*?"<>|]/g, ' ') + '.doc'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); } catch (x) { say(x.message, 'error'); } };
  }
  async function compose() {
    const groupIds = [...document.querySelectorAll('[name=sg]:checked')].map(n => n.value);
    say('초안을 만드는 중…');
    try { const r = await api('/dispatches', { method: 'POST', body: JSON.stringify({ org: $('sOrg').value, kind: $('sKind').value, periodLabel: $('sPeriod').value, itemIds: [...state.selected], groupIds }) }); state.current = r.dispatch; renderDispatch(); say('초안을 만들었습니다. 내용을 다듬은 뒤 승인해 주세요.', 'ok'); }
    catch (x) { say((x.data?.problems || [x.message]).join(' / '), 'error'); }
  }
  async function act(path, body = {}) {
    const d = state.current; if (!d) return; say('처리 중…');
    try { const r = await api('/dispatches/' + encodeURIComponent(d.id) + path, { method: 'POST', body: JSON.stringify(body) }); state.current = r.dispatch || d; renderDispatch(); say(r.message || '처리했습니다.', 'ok'); await loadAll(); }
    catch (x) { say(x.message, 'error'); }
  }
  async function saveDraft() { const d = state.current; say('저장 중…'); try { const r = await api('/dispatches/' + encodeURIComponent(d.id), { method: 'PUT', body: JSON.stringify({ subject: $('dSubject').value, body: $('dBody').value }) }); state.current = r.dispatch; renderDispatch(); say('초안을 저장했습니다.', 'ok'); } catch (x) { say(x.message, 'error'); } }

  function renderPeople() {
    $('gSel').innerHTML = state.groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)} (${L.org[g.org]} · ${L.channel[g.channel]})</option>`).join('');
    if (state.pGroup) $('gSel').value = state.pGroup;
    const g = state.groups.find(x => x.id === $('gSel').value); state.pGroup = g?.id;
    $('gEmailBox').hidden = g?.channel !== 'email'; $('gSubmitBox').hidden = g?.channel !== 'web_submit';
    if (g?.channel === 'web_submit') { $('gUrl').value = g.submitUrl || ''; $('gContact').value = g.contactEmail || ''; }
    const list = state.recipients.filter(r => r.groupId === g?.id);
    $('rList').innerHTML = list.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${r.unsubscribedAt ? '<span class="b warn">수신거부</span>' : '<span class="b ok">수신</span>'}</td><td><small>${esc((r.consentSource === 'subscribe_form' ? '직접 신청 ' : '관리자 등록 ') + String(r.consentAt || '').slice(0, 10))}</small></td><td><button type="button" class="danger" data-rdel="${esc(r.id)}">삭제</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">아직 등록된 사람이 없습니다.</td></tr>';
    document.querySelectorAll('[data-rdel]').forEach(n => n.onclick = async () => { if (!confirm('이 수신자를 삭제할까요?')) return; await api('/recipients/' + encodeURIComponent(n.dataset.rdel), { method: 'DELETE' }); await loadPeople(); say('삭제했습니다.', 'ok'); });
  }
  async function importPeople() {
    if (!$('rConsent').checked) { say('수신 동의를 받은 명단인지 확인해 주세요.', 'error'); return; }
    say('등록 중…');
    try { const r = await api('/recipients/import', { method: 'POST', body: JSON.stringify({ groupId: $('gSel').value, text: $('rText').value, consentConfirmed: true }) }); $('rText').value = ''; await loadPeople(); say(`${r.added}명 등록${r.updated ? `, ${r.updated}명 갱신` : ''}${r.rejected?.length ? `, 인식 못한 줄 ${r.rejected.length}개` : ''}`, 'ok'); }
    catch (x) { say(x.message, 'error'); }
  }
  async function saveGroup() { say('저장 중…'); try { await api('/groups/' + encodeURIComponent($('gSel').value), { method: 'PUT', body: JSON.stringify({ submitUrl: $('gUrl').value, contactEmail: $('gContact').value }) }); await loadGroups(); say('제출 정보를 저장했습니다.', 'ok'); } catch (x) { say(x.message, 'error'); } }

  function renderLog() {
    $('logList').innerHTML = state.dispatches.map(d => `<tr><td>${esc(String(d.createdAt).slice(0, 10))}</td><td>${L.org[d.org]}</td><td><a href="#" data-open="${esc(d.id)}">${esc(d.subject)}</a></td><td>${esc(d.groups.map(g => g.name).join(', '))}</td><td>${L.status[d.status]}${d.sentCount ? ` · ${d.sentCount}명` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">발송 이력이 없습니다.</td></tr>';
    document.querySelectorAll('[data-open]').forEach(n => n.onclick = async e => { e.preventDefault(); const r = await api('/dispatches/' + encodeURIComponent(n.dataset.open)); state.current = r.dispatch; tab('send'); });
  }

  async function loadItems() { state.items = (await api('/items')).items || []; render(); }
  async function loadGroups() { state.groups = (await api('/groups')).groups || []; render(); }
  async function loadPeople() { state.recipients = (await api('/recipients')).recipients || []; await loadGroups(); }
  async function loadLog() { state.dispatches = (await api('/dispatches')).dispatches || []; render(); }
  async function loadAll() { await Promise.all([loadItems(), loadPeople(), loadLog()]); }
  async function boot() {
    try {
      const s = await handoff(); if (!s?.accessToken) { login(); return; } token = s.accessToken;
      state.me = await api('/me');
      $('who').textContent = `${state.me.email} · ${state.me.roleLabel}`; $('mailBadge').textContent = state.me.mail ? '메일 발송 연결됨' : '메일 발송 미연결';
      document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));
      $('itemForm').onsubmit = saveItem; $('btnNew').onclick = resetItemForm; ['q', 'fOrg', 'fKind'].forEach(id => $(id).oninput = renderItems);
      $('sOrg').onchange = renderSend; $('btnCompose').onclick = compose; $('btnSaveDraft').onclick = saveDraft;
      $('btnApprove').onclick = () => confirm('이 내용으로 승인할까요? 승인 후에는 수정할 수 없습니다.') && act('/approve');
      $('btnTest').onclick = () => act('/test'); $('btnSend').onclick = () => confirm('동의한 수신자에게 실제로 발송합니다. 계속할까요?') && act('/send');
      $('btnNewDraft').onclick = () => { state.current = null; renderDispatch(); };
      $('gSel').onchange = () => { state.pGroup = $('gSel').value; renderPeople(); }; $('btnImport').onclick = importPeople; $('btnGroup').onclick = saveGroup;
      $('logout').onclick = () => { sessionStorage.removeItem(SESSION_KEY); location.href = '/sosik'; };
      resetItemForm(); await loadAll(); tab('items'); say('관리 가능', 'ok');
    } catch (x) { say(x.message, 'error'); }
  }
  boot();
}

export function renderAdmin() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>사역소식 발행관리 · 에코디</title>
<style>
:root{--ink:#17221d;--muted:#667168;--line:#dfe5e1;--bg:#f4f6f4;--green:#1f6a4b;--red:#a43636;--amber:#7a5310;--w:min(1180px,calc(100% - 24px))}*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,"Noto Sans KR",system-ui,sans-serif;font-size:14px}
.top{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line)}.top>div,.wrap{width:var(--w);margin:auto}.top>div{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 0;flex-wrap:wrap}
.top h1{font-size:17px;margin:0}.top small{color:var(--muted)}.tabs{display:flex;gap:6px;flex-wrap:wrap}
button,.btn{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;padding:8px 12px;font:inherit;font-size:13px;cursor:pointer;text-decoration:none;display:inline-block}
button.primary,.btn.primary{background:var(--green);color:#fff;border-color:var(--green)}button.danger{color:var(--red)}button:disabled{opacity:.45;cursor:not-allowed}
.state{width:var(--w);margin:10px auto;min-height:20px;color:var(--muted);font-size:13px}.state[data-type=ok]{color:var(--green)}.state[data-type=error]{color:var(--red)}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px;align-items:start}.panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.bar input,.bar select{border:1px solid var(--line);border-radius:10px;padding:8px;font:inherit}.bar input{flex:1;min-width:140px}
.row{display:flex;gap:10px;border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:8px}.row.sel{border-color:var(--green);background:#f3faf5}.grow{flex:1;min-width:0}
.row h3{margin:4px 0 2px;font-size:15px}.row p{margin:0;color:#465149;font-size:13px}.acts{display:flex;flex-direction:column;gap:6px}.pick input{width:20px;height:20px;margin-top:4px}
.meta{font-size:12px;color:var(--muted)}.b{display:inline-block;border-radius:999px;background:#edf2ef;padding:1px 7px;font-size:11px;font-weight:700;color:#456}.b.v-public{background:#e6f4ec;color:#1f6a4b}.b.v-report{background:#eef1fa;color:#3b4f8a}.b.v-private{background:#eee;color:#666}.b.warn{background:#fff3d5;color:var(--amber)}.b.ok{background:#e6f4ec;color:var(--green)}
.f{display:grid;gap:4px;margin-bottom:10px;font-size:12px;font-weight:700;color:var(--muted)}.f input,.f select,.f textarea{border:1px solid var(--line);border-radius:9px;padding:9px;font:inherit;font-size:13px;color:var(--ink);background:#fff}.f textarea{min-height:80px;resize:vertical}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.check{display:flex;gap:8px;align-items:flex-start;margin:6px 0}.empty{padding:24px;text-align:center;color:var(--muted)}
.pick-note{font-weight:700;color:var(--green);margin:0 0 10px}ol,ul{padding-left:20px}.sub{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px 0;border-top:1px solid var(--line)}
table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid var(--line);padding:8px 6px;text-align:left;font-size:13px}.note{font-size:12px;color:var(--muted);background:#f7f8f7;border-radius:10px;padding:10px;margin-top:10px}
#dBody{min-height:320px;font-family:inherit;line-height:1.6}.warnlist{color:var(--amber);font-size:13px}
@media(max-width:900px){.layout{grid-template-columns:1fr}.grid2{grid-template-columns:1fr}}
</style></head><body>
<header class="top"><div><div><h1>사역소식 발행관리</h1><small id="who">권한 확인 중</small> · <small id="mailBadge"></small></div>
<nav class="tabs"><button data-tab="items" class="primary">① 기록·선택</button><button data-tab="send">② 보내기</button><button data-tab="people">③ 대상·수신자</button><button data-tab="log">④ 발송이력</button><a class="btn" href="/sosik" target="_blank" rel="noopener">공개 화면</a><button id="logout">로그아웃</button></nav></div></header>
<div id="state" class="state">인증 확인 중…</div>
<main class="wrap">
<section class="pane" id="pane-items"><div class="layout"><div class="panel"><p class="pick-note" id="pickCount"></p>
<div class="bar"><input id="q" type="search" placeholder="제목·내용 검색"><select id="fOrg"><option value="">전체 소속</option><option value="church">교회</option><option value="mission">선교회</option><option value="shared">공동</option></select><select id="fKind"><option value="">전체 종류</option><option value="news">사역소식</option><option value="activity">활동</option><option value="history">이력</option><option value="prayer">기도제목</option></select></div>
<div id="itemList"></div></div>
<aside class="panel"><h2 id="itemTitle" style="font-size:16px;margin:0 0 12px">새 기록</h2><form id="itemForm">
<div class="grid2"><label class="f">소속<select id="iOrg"></select></label><label class="f">종류<select id="iKind"><option value="news">사역소식</option><option value="activity">활동</option><option value="history">이력</option><option value="prayer">기도제목</option></select></label></div>
<div class="grid2"><label class="f">날짜<input id="iDate" type="date" required></label><label class="f">공개 범위<select id="iVis"><option value="public">사이트 공개</option><option value="partners" selected>후원자·동역자만</option><option value="report">기관 보고 전용</option><option value="private">내부 메모</option></select></label></div>
<label class="f">제목<input id="iTitle" required maxlength="200"></label><label class="f">한 줄 요약<textarea id="iSummary" maxlength="2000" style="min-height:56px"></textarea></label>
<label class="f">자세한 내용<textarea id="iBody"></textarea></label><label class="f">사진 주소 (한 줄에 하나)<textarea id="iPhotos" style="min-height:56px" placeholder="https://..."></textarea></label>
<div class="bar"><button class="primary" type="submit">저장</button><button type="button" id="btnNew">새로 쓰기</button></div>
<div class="note">외국인 사역 사진·이름·체류 관련 정보는 기본 「후원자·동역자만」으로 두고, 본인 동의가 있을 때만 「사이트 공개」로 바꿔 주세요.</div></form></aside></div></section>

<section class="pane" id="pane-send" hidden><div class="layout"><div class="panel">
<h2 style="font-size:16px;margin:0 0 8px">체크한 소식</h2><ul id="sendPicked"></ul>
<div class="grid2"><label class="f">보내는 곳<select id="sOrg"></select></label><label class="f">종류<select id="sKind"><option value="letter">선교편지</option><option value="report">사역보고</option><option value="prayer">기도요청</option></select></label></div>
<label class="f">기간 표시 (비우면 자동)<input id="sPeriod" placeholder="예: 2026년 11월"></label>
<div class="f">받는 대상</div><div id="sendGroups"></div>
<div class="bar" style="margin-top:10px"><button class="primary" id="btnCompose" type="button">초안 만들기</button><button id="btnNewDraft" type="button">새 발송</button></div></div>
<aside class="panel" id="draftBox" hidden><h2 style="font-size:16px;margin:0 0 6px">발송 초안 <small id="dStatus"></small></h2><ul class="warnlist" id="dWarn"></ul>
<label class="f">제목<input id="dSubject"></label><label class="f">본문<textarea id="dBody"></textarea></label>
<div class="bar"><button id="btnSaveDraft" type="button">초안 저장</button><button id="btnApprove" class="primary" type="button">승인</button><button id="btnTest" type="button">나에게 테스트 발송</button><button id="btnSend" class="primary" type="button">메일 발송</button><button id="btnExport" type="button">워드 파일 받기</button></div>
<p class="note" id="mailNote" hidden>메일 발송 연결(Gmail)이 아직 설정되지 않았습니다. 승인·제출 기록·워드 파일은 지금 바로 쓸 수 있습니다.</p>
<div id="dSubmit"></div></aside></div></section>

<section class="pane" id="pane-people" hidden><div class="panel"><label class="f">대상<select id="gSel"></select></label>
<div id="gSubmitBox" hidden><div class="grid2"><label class="f">제출 페이지 주소<input id="gUrl" placeholder="https://"></label><label class="f">담당자 이메일<input id="gContact" type="email"></label></div><button id="btnGroup" type="button">제출 정보 저장</button></div>
<div id="gEmailBox"><table><thead><tr><th>이름</th><th>이메일</th><th>상태</th><th>동의</th><th></th></tr></thead><tbody id="rList"></tbody></table>
<label class="f" style="margin-top:12px">명단 붙여넣기 (한 줄에 한 명: 이름, 이메일, 전화 — 엑셀에서 복사해도 됩니다)<textarea id="rText" placeholder="홍길동, hong@example.com, 010-0000-0000"></textarea></label>
<label class="check"><input type="checkbox" id="rConsent"> <span>이 명단의 분들께 선교편지 수신 동의를 받았습니다.</span></label><button class="primary" id="btnImport" type="button">명단 등록</button>
<p class="note">공개 신청 페이지: <a href="/sosik/subscribe" target="_blank" rel="noopener">ekodi.kr/sosik/subscribe</a> — 이 주소를 카톡·주보로 안내하면 직접 신청이 됩니다.</p></div></div></section>

<section class="pane" id="pane-log" hidden><div class="panel"><table><thead><tr><th>날짜</th><th>소속</th><th>제목</th><th>대상</th><th>상태</th></tr></thead><tbody id="logList"></tbody></table></div></section>
</main>
<script>(${adminClient.toString()})()</script>
</body></html>`;
}

/* ------------------------------------------------------------------- App ---- */

function json(data, status = 200, method = 'GET', extra = {}) {
  return new Response(method === 'HEAD' ? null : JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
  });
}
function html(body, status = 200, method = 'GET', extra = {}) {
  return new Response(method === 'HEAD' ? null : body, {
    status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', ...extra },
  });
}
function same(pathname, base) { const p = pathname.replace(/\/+$/, '') || '/'; return p === base; }
async function readJson(request) { const text = await request.text().catch(() => ''); if (text.length > 400000) return null; try { return JSON.parse(text || '{}'); } catch { return null; } }

const ROLE_LABEL = { operator: '최고운영자', senior_pastor: '담임목회자', pastor: '목회자', staff: '운영 담당', tenant_admin: '선교회 관리자', store_owner: '선교회 관리자' };
const APPROVE_ROLES = new Set(['operator', 'senior_pastor', 'pastor', 'tenant_admin', 'store_owner']);

/**
 * createApp({ store, authenticate, mailer, extraHeaders })
 *  - authenticate(request) → { response } | { data: { userId, email, role, orgs:['church'|'mission'] } }
 *  - mailer: { configured:boolean, send({ to, subject, body }) → messageId }
 */
export function createApp({ store, authenticate, mailer = { configured: false }, extraHeaders = {} }) {
  const J = (data, status = 200, method = 'GET') => json(data, status, method, extraHeaders);
  const H = (body, status = 200, method = 'GET') => html(body, status, method, extraHeaders);

  async function audit(session, action, target, detail = {}) {
    await store.audit({ actorEmail: session?.email || 'public', actorUserId: session?.userId || '', action, target: clean(target, 200), detail: JSON.stringify(detail).slice(0, 2000) });
  }
  function canSee(session, org) { return org === 'shared' || session.orgs.includes(org); }
  async function decorateDispatch(dispatch) {
    const groups = await store.listGroups();
    const byId = Object.fromEntries(groups.map(g => [g.id, g]));
    const deliveries = await store.listDeliveries(dispatch.id);
    return { ...dispatch, groups: dispatch.groupIds.map(id => byId[id]).filter(Boolean), submissions: deliveries.filter(d => d.status === 'SUBMITTED').map(d => d.groupId) };
  }
  async function pendingEmail(dispatch) {
    const groups = (await store.listGroups()).filter(g => dispatch.groupIds.includes(g.id) && g.channel === 'email');
    // One letter per person per dispatch, even when the same address sits in several groups.
    const busy = (await store.listDeliveries(dispatch.id)).filter(d => d.status === 'SENT' || d.status === 'SENDING');
    const delivered = new Set(busy.map(d => d.recipientId));
    const deliveredEmail = new Set(busy.map(d => String(d.email || '').toLowerCase()).filter(Boolean));
    const out = []; const seen = new Set();
    for (const group of groups) {
      for (const r of await store.listRecipients(group.id)) {
        if (r.unsubscribedAt || !r.consentAt || delivered.has(r.id) || deliveredEmail.has(r.email) || seen.has(r.email)) continue;
        seen.add(r.email); out.push({ ...r, groupName: group.name });
      }
    }
    return { groups, recipients: out };
  }
  async function settle(dispatch) {
    const { groups, recipients } = await pendingEmail(dispatch);
    const allGroups = (await store.listGroups()).filter(g => dispatch.groupIds.includes(g.id));
    const deliveries = await store.listDeliveries(dispatch.id);
    const submitted = new Set(deliveries.filter(d => d.status === 'SUBMITTED').map(d => d.groupId));
    const webPending = allGroups.filter(g => g.channel === 'web_submit' && !submitted.has(g.id));
    const sentCount = deliveries.filter(d => d.status === 'SENT').length;
    const failedCount = deliveries.filter(d => d.status === 'FAILED').length;
    const done = recipients.length === 0 && webPending.length === 0;
    const touched = sentCount > 0 || submitted.size > 0 || (groups.length === 0 && webPending.length === 0);
    const status = done ? 'SENT' : (touched ? 'PARTIAL' : dispatch.status);
    const now = new Date().toISOString();
    return store.updateDispatch(dispatch.id, { status, sentCount, failedCount, sentAt: done ? now : dispatch.sentAt, updatedAt: now });
  }

  async function adminApi(request, url) {
    const method = request.method;
    const auth = await authenticate(request, url);
    if (auth.response) return auth.response;
    const s = auth.data;
    const path = url.pathname.slice(ADMIN_API.length).replace(/^\/+/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const [res, id, action] = path;

    if (res === 'me' && method === 'GET') {
      return J({ ok: true, email: s.email, role: s.role, roleLabel: ROLE_LABEL[s.role] || s.role, orgs: s.orgs, canApprove: APPROVE_ROLES.has(s.role), mail: Boolean(mailer.configured) });
    }

    if (res === 'items') {
      if (!id && method === 'GET') {
        const items = (await store.listItems()).filter(i => i.status !== 'archived' && canSee(s, i.org));
        const sent = alreadySentMap(await store.listDispatches(500), (await store.listGroups()).map(g => g.id));
        return J({ items: items.map(i => ({ ...i, sentCount: sent[i.id]?.length || 0 })) });
      }
      if (!id && method === 'POST') {
        const body = await readJson(request); if (!body) return J({ error: '내용을 확인해 주세요.' }, 400);
        const item = normalizeItem(body); if (!item.title) return J({ error: '제목은 필수입니다.' }, 400);
        if (!canSee(s, item.org)) return J({ error: '이 소속에 기록할 권한이 없습니다.' }, 403);
        const now = new Date().toISOString();
        const saved = await store.createItem({ id: newId('item'), ...item, createdAt: now, updatedAt: now, createdBy: s.email, updatedBy: s.email });
        await audit(s, 'sosik.item.create', saved.id, { org: item.org, visibility: item.visibility });
        return J({ ok: true, item: saved }, 201);
      }
      if (id) {
        const current = await store.getItem(id);
        if (!current || !canSee(s, current.org)) return J({ error: '기록을 찾을 수 없습니다.' }, 404);
        if (method === 'PUT') {
          const body = await readJson(request); if (!body) return J({ error: '내용을 확인해 주세요.' }, 400);
          const item = normalizeItem(body, current); if (!item.title) return J({ error: '제목은 필수입니다.' }, 400);
          if (!canSee(s, item.org)) return J({ error: '이 소속으로 옮길 권한이 없습니다.' }, 403);
          const saved = await store.updateItem(id, { ...item, updatedAt: new Date().toISOString(), updatedBy: s.email });
          await audit(s, 'sosik.item.update', id, { org: item.org, visibility: item.visibility });
          return J({ ok: true, item: saved });
        }
        if (method === 'DELETE') {
          await store.updateItem(id, { status: 'archived', updatedAt: new Date().toISOString(), updatedBy: s.email });
          await audit(s, 'sosik.item.archive', id, { title: current.title });
          return J({ ok: true });
        }
      }
    }

    if (res === 'groups') {
      if (!id && method === 'GET') {
        const groups = (await store.listGroups()).filter(g => canSee(s, g.org));
        const recipients = await store.listRecipients();
        return J({ groups: groups.map(g => ({ ...g, activeCount: recipients.filter(r => r.groupId === g.id && !r.unsubscribedAt && r.consentAt).length })) });
      }
      if (id && method === 'PUT') {
        if (!APPROVE_ROLES.has(s.role)) return J({ error: '대상 정보를 바꿀 권한이 없습니다.' }, 403);
        const group = await store.getGroup(id); if (!group || !canSee(s, group.org)) return J({ error: '대상을 찾을 수 없습니다.' }, 404);
        const body = await readJson(request) || {};
        const contactEmail = clean(body.contactEmail, 200);
        if (contactEmail && !isEmail(contactEmail)) return J({ error: '담당자 이메일 형식을 확인해 주세요.' }, 400);
        const submitUrl = body.submitUrl === undefined ? group.submitUrl : safeUrl(body.submitUrl);
        if (clean(body.submitUrl) && !submitUrl) return J({ error: '제출 주소는 https://로 시작해야 합니다.' }, 400);
        const saved = await store.updateGroup(id, { submitUrl, contactEmail, updatedAt: new Date().toISOString() });
        await audit(s, 'sosik.group.update', id, { submitUrl });
        return J({ ok: true, group: saved });
      }
    }

    if (res === 'recipients') {
      const groups = await store.listGroups();
      const visible = new Set(groups.filter(g => canSee(s, g.org)).map(g => g.id));
      if (!id && method === 'GET') return J({ recipients: (await store.listRecipients()).filter(r => visible.has(r.groupId)) });
      if (id === 'import' && method === 'POST') {
        const body = await readJson(request); if (!body) return J({ error: '명단을 확인해 주세요.' }, 400);
        const group = groups.find(g => g.id === body.groupId);
        if (!group || !visible.has(group.id) || group.channel !== 'email') return J({ error: '메일 대상을 선택해 주세요.' }, 400);
        if (body.consentConfirmed !== true) return J({ error: '수신 동의 확인이 필요합니다.' }, 400);
        const { rows, rejected } = parseRecipientCsv(body.text);
        if (rows.length > 2000) return J({ error: '한 번에 2000명까지 등록할 수 있습니다.' }, 400);
        let added = 0; let updated = 0;
        for (const row of rows) {
          const result = await store.upsertRecipient({ groupId: group.id, ...row, consentSource: 'admin_import', consentBy: s.email });
          result.created ? added++ : updated++;
        }
        await audit(s, 'sosik.recipient.import', group.id, { added, updated, rejected: rejected.length });
        return J({ ok: true, added, updated, rejected });
      }
      if (id && method === 'DELETE') {
        const r = await store.getRecipient(id); if (!r || !visible.has(r.groupId)) return J({ error: '수신자를 찾을 수 없습니다.' }, 404);
        await store.deleteRecipient(id); await audit(s, 'sosik.recipient.delete', r.groupId, { email: r.email });
        return J({ ok: true });
      }
    }

    if (res === 'dispatches') {
      if (!id && method === 'GET') {
        const list = (await store.listDispatches(200)).filter(d => canSee(s, d.org));
        return J({ dispatches: await Promise.all(list.map(decorateDispatch)) });
      }
      if (!id && method === 'POST') {
        const body = await readJson(request); if (!body) return J({ error: '내용을 확인해 주세요.' }, 400);
        const org = clean(body.org, 20); const kind = pick(DISPATCH_KINDS, body.kind, 'letter');
        if (!s.orgs.includes(org)) return J({ error: '이 소속으로 보낼 권한이 없습니다.', problems: ['이 소속으로 보낼 권한이 없습니다.'] }, 403);
        const itemIds = [...new Set((Array.isArray(body.itemIds) ? body.itemIds : []).map(v => clean(v, 120)))].slice(0, 100);
        const groupIds = [...new Set((Array.isArray(body.groupIds) ? body.groupIds : []).map(v => clean(v, 120)))].slice(0, 20);
        const items = (await Promise.all(itemIds.map(i => store.getItem(i)))).filter(Boolean);
        const allGroups = await store.listGroups();
        const groups = groupIds.map(g => allGroups.find(x => x.id === g)).filter(g => g && g.active);
        const check = checkSelection({ org, items, groups });
        if (items.length !== itemIds.length) check.problems.push('찾을 수 없는 소식이 섞여 있습니다.');
        if (groups.length !== groupIds.length) check.problems.push('사용할 수 없는 대상이 섞여 있습니다.');
        if (check.problems.length) return J({ error: '선택한 내용을 확인해 주세요.', problems: check.problems }, 400);
        const draft = composeDraft({ org, kind, items, periodLabel: body.periodLabel });
        const sent = alreadySentMap(await store.listDispatches(500), groupIds);
        const warnings = items.filter(i => sent[i.id]).map(i => `「${i.title}」은(는) 같은 대상에게 이미 보낸 적이 있습니다.`);
        const now = new Date().toISOString();
        const dispatch = await store.createDispatch({ id: newId('send'), org, kind, subject: draft.subject, body: draft.body, periodLabel: draft.periodLabel, itemIds, groupIds, status: 'DRAFT', sentCount: 0, failedCount: 0, createdAt: now, updatedAt: now, createdBy: s.email, approvedAt: '', approvedBy: '', sentAt: '' });
        await audit(s, 'sosik.dispatch.create', dispatch.id, { org, kind, items: itemIds.length, groups: groupIds });
        return J({ ok: true, dispatch: { ...(await decorateDispatch(dispatch)), alreadySent: warnings } }, 201);
      }
      if (id) {
        const dispatch = await store.getDispatch(id);
        if (!dispatch || !canSee(s, dispatch.org)) return J({ error: '발송을 찾을 수 없습니다.' }, 404);
        if (!action && method === 'GET') return J({ dispatch: await decorateDispatch(dispatch) });
        if (!action && method === 'PUT') {
          if (dispatch.status !== 'DRAFT') return J({ error: '승인된 발송은 수정할 수 없습니다. 새 발송을 만들어 주세요.' }, 409);
          const body = await readJson(request) || {};
          const subject = clean(body.subject ?? dispatch.subject, 200); const text = clean(body.body ?? dispatch.body, 40000);
          if (!subject || !text) return J({ error: '제목과 본문을 입력해 주세요.' }, 400);
          const saved = await store.updateDispatch(id, { subject, body: text, updatedAt: new Date().toISOString() });
          await audit(s, 'sosik.dispatch.update', id);
          return J({ ok: true, dispatch: await decorateDispatch(saved) });
        }
        if (action === 'approve' && method === 'POST') {
          if (!APPROVE_ROLES.has(s.role)) return J({ error: '승인 권한이 없습니다.' }, 403);
          if (dispatch.status !== 'DRAFT') return J({ error: '이미 승인된 발송입니다.' }, 409);
          const now = new Date().toISOString();
          let saved = await store.updateDispatch(id, { status: 'APPROVED', approvedAt: now, approvedBy: s.email, updatedAt: now });
          // A site-only dispatch has nothing left to deliver: public items are already on the site.
          const groups = (await store.listGroups()).filter(g => dispatch.groupIds.includes(g.id));
          if (groups.every(g => g.channel === 'site')) saved = await settle(saved);
          await audit(s, 'sosik.dispatch.approve', id);
          return J({ ok: true, message: '승인했습니다. 메일 발송 또는 제출을 진행해 주세요.', dispatch: await decorateDispatch(saved) });
        }
        if (action === 'test' && method === 'POST') {
          if (!mailer.configured) return J({ error: '메일 발송 연결이 아직 설정되지 않았습니다.' }, 409);
          const messageId = await mailer.send({ to: s.email, subject: `[테스트] ${dispatch.subject}`, body: letterForRecipient(dispatch, { name: '', unsubToken: 'test', groupName: '테스트' }, url.origin) });
          await audit(s, 'sosik.dispatch.test', id, { to: s.email, messageId });
          return J({ ok: true, message: `${s.email}로 테스트 메일을 보냈습니다.`, dispatch: await decorateDispatch(dispatch) });
        }
        if (action === 'send' && method === 'POST') {
          if (!APPROVE_ROLES.has(s.role)) return J({ error: '발송 권한이 없습니다.' }, 403);
          if (!['APPROVED', 'PARTIAL'].includes(dispatch.status)) return J({ error: '승인된 발송만 보낼 수 있습니다.' }, 409);
          if (!mailer.configured) return J({ error: '메일 발송 연결이 아직 설정되지 않았습니다.' }, 409);
          const { recipients } = await pendingEmail(dispatch);
          const batch = recipients.slice(0, SEND_BATCH);
          let sentNow = 0; let failedNow = 0;
          for (const r of batch) {
            const claimed = await store.claimDelivery({ id: newId('dlv'), dispatchId: id, groupId: r.groupId, recipientId: r.id, email: r.email });
            if (!claimed) continue;
            try {
              const messageId = await mailer.send({ to: r.email, subject: dispatch.subject, body: letterForRecipient(dispatch, r, url.origin) });
              await store.finishDelivery(claimed, { status: 'SENT', messageId }); sentNow++;
            } catch (error) {
              await store.finishDelivery(claimed, { status: 'FAILED', error: clean(error?.message, 500) }); failedNow++;
            }
          }
          const saved = await settle(dispatch);
          await audit(s, 'sosik.dispatch.send', id, { sentNow, failedNow, remaining: recipients.length - batch.length });
          const remaining = recipients.length - batch.length;
          return J({ ok: true, sentNow, failedNow, remaining, message: `${sentNow}명에게 보냈습니다${failedNow ? `, ${failedNow}명 실패` : ''}${remaining > 0 ? `. 남은 ${remaining}명은 「메일 발송」을 한 번 더 눌러 주세요.` : '.'}`, dispatch: await decorateDispatch(saved) });
        }
        if (action === 'submitted' && method === 'POST') {
          if (!['APPROVED', 'PARTIAL', 'SENT'].includes(dispatch.status)) return J({ error: '승인 후 제출 기록을 남길 수 있습니다.' }, 409);
          const body = await readJson(request) || {};
          const group = (await store.listGroups()).find(g => g.id === body.groupId && dispatch.groupIds.includes(g.id) && g.channel === 'web_submit');
          if (!group) return J({ error: '제출 대상을 확인해 주세요.' }, 400);
          await store.recordSubmission({ id: newId('dlv'), dispatchId: id, groupId: group.id, note: clean(body.note, 500), actor: s.email });
          const saved = await settle(dispatch);
          await audit(s, 'sosik.dispatch.submitted', id, { group: group.id });
          return J({ ok: true, message: `「${group.name}」 제출을 기록했습니다.`, dispatch: await decorateDispatch(saved) });
        }
        if (action === 'export' && method === 'GET') {
          return new Response(renderWordExport(dispatch), { headers: { 'content-type': 'application/msword; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(dispatch.subject.replace(/[\\/:*?"<>|]/g, ' ') + '.doc')}`, 'cache-control': 'no-store', ...extraHeaders } });
        }
      }
    }
    return J({ error: '허용되지 않은 요청입니다.' }, 405, method);
  }

  async function publicApi(request, url) {
    const method = request.method;
    const sub = url.pathname.slice(PUBLIC_API.length).replace(/^\/+/, '');
    if (sub === 'feed' && (method === 'GET' || method === 'HEAD')) {
      const org = ['church', 'mission'].includes(url.searchParams.get('org')) ? url.searchParams.get('org') : '';
      const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 20));
      const items = (await store.listItems()).filter(i => i.visibility === 'public' && i.status !== 'archived' && (!org || orgCompatible(i.org, org))).slice(0, limit)
        .map(i => ({ id: i.id, org: i.org, kind: i.kind, eventDate: i.eventDate, title: i.title, summary: i.summary, photos: i.photos }));
      return json({ items }, 200, method, { ...extraHeaders, 'access-control-allow-origin': 'https://ekodi.kr', 'cache-control': 'public, max-age=120' });
    }
    if (sub === 'subscribe' && method === 'POST') {
      const body = await readJson(request); if (!body) return J({ error: '입력 내용을 확인해 주세요.' }, 400);
      if (clean(body.website)) return J({ ok: true }); // honeypot: pretend success
      const email = clean(body.email, 200).toLowerCase();
      if (!isEmail(email)) return J({ error: '이메일 주소를 확인해 주세요.' }, 400);
      if (body.consent !== true) return J({ error: '개인정보 수집·이용 동의가 필요합니다.' }, 400);
      const groups = (await store.listGroups()).filter(g => g.channel === 'email' && g.publicSubscribe && g.active);
      const chosen = [...new Set(Array.isArray(body.groups) ? body.groups : [])].map(id => groups.find(g => g.id === id)).filter(Boolean);
      if (!chosen.length) return J({ error: '받을 소식을 하나 이상 골라 주세요.' }, 400);
      for (const group of chosen) await store.upsertRecipient({ groupId: group.id, name: clean(body.name, 80), email, phone: '', consentSource: 'subscribe_form', consentBy: email });
      await audit(null, 'sosik.subscribe', chosen.map(g => g.id).join(','), {});
      return J({ ok: true, message: '신청이 정상적으로 접수되었습니다.' });
    }
    if (sub === 'unsubscribe' && method === 'POST') {
      const body = await readJson(request) || {};
      const r = await store.getRecipientByToken(clean(body.token, 200));
      if (!r) return J({ error: '링크가 올바르지 않습니다.' }, 404);
      if (!r.unsubscribedAt) await store.updateRecipient(r.id, { unsubscribedAt: new Date().toISOString() });
      await audit(null, 'sosik.unsubscribe', r.groupId, {});
      return J({ ok: true, message: '수신거부가 정상적으로 처리되었습니다.' });
    }
    return J({ error: 'not_found' }, 404, method);
  }

  return async function handle(request) {
    const url = new URL(request.url);
    const method = request.method;
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'https://ekodi.kr', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', ...extraHeaders } });
    if (url.pathname === ADMIN_API || url.pathname.startsWith(`${ADMIN_API}/`)) {
      return adminApi(request, url);
    }
    if (url.pathname.startsWith(`${PUBLIC_API}/`)) return publicApi(request, url);
    if (!['GET', 'HEAD'].includes(method)) return J({ error: '허용되지 않은 요청입니다.' }, 405, method);
    if (same(url.pathname, ADMIN_PATH)) return H(renderAdmin(), 200, method);
    if (same(url.pathname, SUBSCRIBE_PATH)) return H(renderSubscribe(await store.listGroups()), 200, method);
    if (same(url.pathname, UNSUBSCRIBE_PATH)) {
      const token = clean(url.searchParams.get('t'), 200);
      const recipient = token ? await store.getRecipientByToken(token) : null;
      const group = recipient ? await store.getGroup(recipient.groupId) : null;
      return H(renderUnsubscribe(token, recipient && !recipient.unsubscribedAt ? { ...recipient, groupName: group?.name } : null), 200, method);
    }
    if (same(url.pathname, PUBLIC_PATH)) {
      const org = ['church', 'mission'].includes(url.searchParams.get('org')) ? url.searchParams.get('org') : '';
      return H(renderPublicFeed(await store.listItems(), org), 200, method);
    }
    return J({ error: 'not_found' }, 404, method);
  };
}
