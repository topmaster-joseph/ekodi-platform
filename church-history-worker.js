const PUBLIC_PATH = '/ekodichurch/history';
const ADMIN_PATH = '/ekodichurch/admin/history';
const API_PREFIX = '/api/church/admin/history';
const CENTRAL_SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const CENTRAL_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const CHURCH_PASTOR_API = 'https://renzehysxirjilvdxacv.supabase.co/functions/v1/church-pastor-api';
const WRITE_ROLES = new Set(['senior_pastor', 'pastor', 'staff']);
const VALID_VERIFICATION = new Set(['documented', 'contextual', 'oral-history', 'needs-review']);
const VALID_VISIBILITY = new Set(['public', 'private']);

function clean(value, max = 12000) {
  return String(value ?? '').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function responseHtml(body, status = 200, method = 'GET') {
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
  });
  return new Response(method === 'HEAD' ? null : body, { status, headers });
}

function responseJson(data, status = 200, method = 'GET') {
  return new Response(method === 'HEAD' ? null : JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function verificationMeta(status) {
  const map = {
    documented: ['문서 확인', 'verified'],
    contextual: ['맥락 기록', 'contextual'],
    'oral-history': ['구술 기록', 'oral'],
    'needs-review': ['추가 검토', 'review'],
  };
  return map[status] || map['needs-review'];
}

function publicEntryCard(entry) {
  const [verificationLabel, verificationClass] = verificationMeta(entry.verification_status);
  const body = clean(entry.body_text, 20000);
  return `<article class="history-item${Number(entry.featured) ? ' featured' : ''}">
    <div class="history-rail" aria-hidden="true"><span></span></div>
    <div class="history-card">
      <div class="history-meta">
        <time>${escapeHtml(entry.date_label || entry.start_date || '')}</time>
        <span class="era">${escapeHtml(entry.era || '')}</span>
        <span class="verification ${verificationClass}">${verificationLabel}</span>
      </div>
      <h2>${escapeHtml(entry.title)}</h2>
      <p class="summary">${escapeHtml(entry.summary)}</p>
      ${body ? `<p class="body-copy">${escapeHtml(body)}</p>` : ''}
      <div class="detail-row">
        ${entry.organization ? `<span>${escapeHtml(entry.organization)}</span>` : ''}
        ${entry.place ? `<span>${escapeHtml(entry.place)}</span>` : ''}
      </div>
    </div>
  </article>`;
}

export function renderPublicHistory(entries = []) {
  const cards = entries.map(publicEntryCard).join('');
  const count = entries.length;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>지나온 길 · 에코디교회</title>
<meta name="description" content="한 사람의 부르심에서 대학과 지역교회, 선교 공동체와 에코디교회로 이어진 사역의 길을 기록합니다.">
<link rel="canonical" href="https://ekodi.kr/ekodichurch/history">
<style>
:root{--ink:#15231d;--muted:#637068;--line:#dfe7e2;--paper:#f8faf8;--card:#fff;--green:#1f6a4b;--green-soft:#eaf4ee;--amber:#855b11;--amber-soft:#fff6df;--blue:#355d85;--blue-soft:#eef5fb;--radius:22px}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(180deg,#f4f8f5 0,#fff 30%,#f7f8f4 100%);color:var(--ink);font-family:Pretendard,"Noto Sans KR",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.72}.shell{width:min(980px,calc(100% - 32px));margin:0 auto}.topbar{display:flex;align-items:center;justify-content:space-between;padding:22px 0 10px;gap:16px}.brand{text-decoration:none;color:var(--ink);font-weight:800;letter-spacing:-.03em}.back{text-decoration:none;color:var(--muted);font-size:14px;padding:9px 13px;border:1px solid var(--line);border-radius:999px;background:#fff}.hero{padding:72px 0 56px}.eyebrow{display:inline-flex;align-items:center;gap:8px;color:var(--green);font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.eyebrow:before{content:"";width:28px;height:1px;background:currentColor}.hero h1{font-size:clamp(42px,8vw,76px);line-height:1.03;letter-spacing:-.065em;margin:18px 0 24px}.hero p{font-size:clamp(17px,2.5vw,21px);max-width:720px;margin:0;color:#3e4b44;letter-spacing:-.025em}.principle{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:30px 0 0}.principle div{padding:18px 19px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.78)}.principle strong{display:block;font-size:13px;margin-bottom:4px}.principle span{font-size:13px;color:var(--muted)}.intro{padding:34px;border-radius:var(--radius);background:#173e2e;color:#f4fbf6;margin-bottom:60px;box-shadow:0 20px 55px rgba(23,62,46,.12)}.intro p{margin:0;font-size:18px;letter-spacing:-.02em}.intro p+p{margin-top:14px;color:#d6e7dd;font-size:15px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:0 0 28px}.section-head h2{font-size:28px;letter-spacing:-.045em;margin:0}.section-head p{margin:0;color:var(--muted);font-size:14px}.timeline{position:relative;padding-bottom:30px}.history-item{display:grid;grid-template-columns:34px 1fr;gap:18px;position:relative}.history-rail{position:relative;display:flex;justify-content:center}.history-rail:after{content:"";position:absolute;top:16px;bottom:-16px;width:1px;background:var(--line)}.history-item:last-child .history-rail:after{display:none}.history-rail span{position:relative;z-index:1;width:13px;height:13px;margin-top:25px;border-radius:50%;background:#fff;border:3px solid #8aa596;box-shadow:0 0 0 5px #f7faf8}.history-item.featured .history-rail span{border-color:var(--green);background:var(--green)}.history-card{padding:22px 24px 25px;margin:0 0 19px;border:1px solid var(--line);border-radius:20px;background:rgba(255,255,255,.92);box-shadow:0 8px 28px rgba(24,45,34,.045)}.history-item.featured .history-card{border-color:#c9ddd1}.history-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:9px}.history-meta time{font-weight:800;font-size:14px}.era,.verification{display:inline-flex;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:750}.era{background:#f0f3f1;color:#5b685f}.verification.verified{background:var(--green-soft);color:var(--green)}.verification.contextual{background:var(--blue-soft);color:var(--blue)}.verification.oral{background:#f4effa;color:#68448c}.verification.review{background:var(--amber-soft);color:var(--amber)}.history-card h2{font-size:22px;line-height:1.3;letter-spacing:-.04em;margin:0 0 10px}.summary{font-size:16px;margin:0;color:#34433b}.body-copy{font-size:14px;color:var(--muted);margin:12px 0 0;padding-top:12px;border-top:1px solid #eef1ef}.detail-row{display:flex;flex-wrap:wrap;gap:8px 15px;margin-top:15px;color:#758078;font-size:12px}.detail-row span:before{content:"·";margin-right:6px}.empty{padding:42px;text-align:center;border:1px dashed var(--line);border-radius:20px;color:var(--muted)}.footer{margin:60px 0 28px;padding:28px 0;border-top:1px solid var(--line);color:var(--muted);font-size:13px}.footer strong{color:var(--ink)}@media(max-width:700px){.shell{width:min(100% - 22px,980px)}.topbar{padding-top:14px}.hero{padding:52px 4px 40px}.principle{grid-template-columns:1fr}.intro{padding:24px;margin-bottom:46px}.history-item{grid-template-columns:23px 1fr;gap:9px}.history-card{padding:19px 18px}.section-head{display:block}.section-head p{margin-top:6px}.detail-row{display:block}.detail-row span{display:block;margin-top:3px}}
</style>
</head>
<body>
<div class="shell">
  <header class="topbar"><a class="brand" href="/ekodichurch">에코디교회</a><a class="back" href="/ekodichurch">교회 홈으로</a></header>
  <main>
    <section class="hero">
      <span class="eyebrow">Our Story</span>
      <h1>지나온 길</h1>
      <p>교회의 이름이 생긴 날보다 먼저 시작된 만남과 섬김을 기억합니다. 한 사람의 삶에서 시작해 대학과 지역교회, 선교 공동체와 교회로 이어진 길을 사실과 기억을 구분하며 기록합니다.</p>
      <div class="principle">
        <div><strong>사실은 사실대로</strong><span>문서로 확인된 기록을 근거와 함께 보존합니다.</span></div>
        <div><strong>기억은 기억대로</strong><span>구술과 회고는 문서 기록과 구분해 남깁니다.</span></div>
        <div><strong>빈칸도 역사로</strong><span>아직 확인되지 않은 시기는 억지로 채우지 않습니다.</span></div>
      </div>
    </section>
    <section class="intro">
      <p>에코디교회의 이야기는 교회의 이름이 생긴 날부터 시작되지 않습니다. 목포대학교에서 세계 여러 나라의 학생들을 만나고, 지역교회와 함께 외국인 유학생을 섬기고, 대학과 교회와 선교단체가 협력하면서 한 공동체의 길이 열렸습니다.</p>
      <p>한국외국인선교회 무안지부와 에코디선교회, 목포대학교 글로벌비전센터의 사역은 서로 지워지는 이름이 아니라 오늘의 에코디교회를 이해하게 하는 역사적 층위로 함께 기록됩니다.</p>
    </section>
    <section aria-labelledby="timeline-title">
      <div class="section-head"><div><h2 id="timeline-title">사역의 흐름</h2><p>개인의 삶 · 지역교회 · 연합선교 · 선교회 · 글로벌비전센터 · 에코디교회</p></div><p>${count ? `${count}개의 확인·관리 기록` : '기록 준비 중'}</p></div>
      <div class="timeline">${cards || '<div class="empty">공개 승인된 역사 기록을 준비하고 있습니다.</div>'}</div>
    </section>
  </main>
  <footer class="footer"><strong>에코디교회 역사 아카이브</strong><br>이 기록은 새로운 자료와 증언이 확인될 때 수정·보완됩니다. 서로 다른 창립·전환 기록은 의미가 확인될 때까지 각각 보존합니다.</footer>
</div>
</body>
</html>`;
}

function adminClient() {
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const SESSION_KEY = 'ekodi-church-pastor-session';
  const AUTH_URL = 'https://ekodi.kr/auth/';
  const API = '/api/church/admin/history';
  let session = null;
  let rows = [];
  let editingId = '';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function stored() { try { const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); return value?.accessToken ? value : null; } catch { return null; } }
  function save(value) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); }
  function clear() { sessionStorage.removeItem(SESSION_KEY); }
  function normalize(data, current = {}) { return { accessToken: data.access_token || '', refreshToken: data.refresh_token || current.refreshToken || '', expiresAt: Number(data.expires_at || 0) || Math.floor(Date.now()/1000) + Number(data.expires_in || 3600), user: { id: data.user?.id || current.user?.id || '', email: data.user?.email || current.user?.email || '' } }; }
  async function authRequest(path, body) { const response = await fetch(SUPABASE_URL + path, { method:'POST', headers:{apikey:SUPABASE_KEY,'content-type':'application/json'}, body:JSON.stringify(body) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error_description || data.msg || data.error || '인증에 실패했습니다.'); return data; }
  async function consumeHandoff() { const params = new URLSearchParams(location.hash.slice(1)); const token = params.get('ekodi_token'); if (!token) return stored(); const data = await authRequest('/auth/v1/verify', { token_hash:token, type:params.get('ekodi_type') || 'email' }); const next = normalize(data); if (!next.accessToken) throw new Error('로그인 연결에 실패했습니다.'); save(next); history.replaceState(null,'',location.pathname + location.search); return next; }
  async function validSession() { let value = stored(); if (!value?.accessToken) return null; if (!value.expiresAt || value.expiresAt > Math.floor(Date.now()/1000) + 60) return value; if (!value.refreshToken) { clear(); return null; } try { const data = await authRequest('/auth/v1/token?grant_type=refresh_token', { refresh_token:value.refreshToken }); value = normalize(data,value); save(value); return value; } catch { clear(); return null; } }
  function authHref() { const url = new URL(AUTH_URL); url.searchParams.set('site','church'); url.searchParams.set('return_to',location.origin + location.pathname); return url.href; }
  async function api(path = '', options = {}) { const response = await fetch(API + path, { ...options, headers:{authorization:'Bearer ' + session.accessToken,'content-type':'application/json',...(options.headers || {})}, cache:'no-store' }); const data = await response.json().catch(() => ({})); if (response.status === 401) { clear(); location.href = authHref(); throw new Error('로그인이 필요합니다.'); } if (!response.ok) throw new Error(data.error || '기록 처리에 실패했습니다.'); return data; }
  function setState(text, type = '') { const node = $('state'); node.textContent = text; node.dataset.type = type; }
  function badge(status) { const label = {documented:'문서 확인',contextual:'맥락 기록','oral-history':'구술 기록','needs-review':'추가 검토'}[status] || status; return '<span class="badge ' + esc(status) + '">' + esc(label) + '</span>'; }
  function renderRows() {
    const query = $('filter').value.trim().toLowerCase();
    const filtered = rows.filter(row => !query || [row.dateLabel,row.era,row.organization,row.title,row.summary,row.verificationStatus].join(' ').toLowerCase().includes(query));
    $('count').textContent = filtered.length + ' / ' + rows.length + '개';
    $('records').innerHTML = filtered.map(row => '<article class="record" data-id="' + esc(row.id) + '"><div class="record-head"><div><span class="date">' + esc(row.dateLabel || row.startDate) + '</span> ' + badge(row.verificationStatus) + (row.visibility === 'private' ? ' <span class="badge private">비공개</span>' : '') + '</div><div class="record-actions"><button type="button" data-edit="' + esc(row.id) + '">수정</button><button type="button" class="danger" data-delete="' + esc(row.id) + '">삭제</button></div></div><h3>' + esc(row.title) + '</h3><p>' + esc(row.summary) + '</p><small>' + esc(row.era) + (row.organization ? ' · ' + esc(row.organization) : '') + '</small></article>').join('') || '<div class="empty">조건에 맞는 기록이 없습니다.</div>';
    document.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => edit(button.dataset.edit));
    document.querySelectorAll('[data-delete]').forEach(button => button.onclick = () => remove(button.dataset.delete));
  }
  function resetForm() { editingId = ''; $('editor').reset(); $('entryId').value = ''; $('visibility').value = 'private'; $('verificationStatus').value = 'needs-review'; $('sourceType').value = 'document'; $('kind').value = 'milestone'; $('sortOrder').value = String((rows.at(-1)?.sortOrder || 0) + 10); $('featured').checked = false; $('editorTitle').textContent = '새 기록'; $('saveButton').textContent = '기록 추가'; }
  function edit(id) { const row = rows.find(item => item.id === id); if (!row) return; editingId = id; const values = {entryId:row.id,startDate:row.startDate,endDate:row.endDate,dateLabel:row.dateLabel,era:row.era,organization:row.organization,relationType:row.relationType,kind:row.kind,title:row.title,summary:row.summary,bodyText:row.bodyText,place:row.place,peopleText:row.peopleText,sourceTitle:row.sourceTitle,sourceType:row.sourceType,sourceRef:row.sourceRef,verificationStatus:row.verificationStatus,verificationNote:row.verificationNote,visibility:row.visibility,sortOrder:row.sortOrder}; for (const [key,value] of Object.entries(values)) { const node = $(key); if (node) node.value = value ?? ''; } $('featured').checked = Boolean(row.featured); $('editorTitle').textContent = '기록 수정'; $('saveButton').textContent = '변경 저장'; $('editor').scrollIntoView({behavior:'smooth',block:'start'}); }
  async function remove(id) { const row = rows.find(item => item.id === id); if (!row || !confirm('“' + row.title + '” 기록을 삭제할까요? 감사로그에는 삭제 사실이 남습니다.')) return; setState('삭제 중…'); try { await api('/' + encodeURIComponent(id), {method:'DELETE'}); await load(); setState('삭제했습니다.','ok'); } catch (error) { setState(error.message,'error'); } }
  async function load() { const data = await api(); rows = data.entries || []; $('role').textContent = data.roleLabel || data.role || ''; $('writeMode').textContent = data.canWrite ? '편집 가능' : '조회 전용'; renderRows(); if (!editingId) resetForm(); }
  async function submit(event) { event.preventDefault(); const form = new FormData(event.currentTarget); const body = Object.fromEntries(form.entries()); body.featured = $('featured').checked; body.sortOrder = Number(body.sortOrder || 0); setState(editingId ? '변경 저장 중…' : '기록 추가 중…'); try { if (editingId) await api('/' + encodeURIComponent(editingId), {method:'PUT',body:JSON.stringify(body)}); else await api('', {method:'POST',body:JSON.stringify(body)}); editingId = ''; await load(); setState('저장했습니다.','ok'); } catch (error) { setState(error.message,'error'); } }
  async function boot() { try { session = await consumeHandoff(); session = await validSession(); if (!session) { location.href = authHref(); return; } $('editor').onsubmit = submit; $('filter').oninput = renderRows; $('newButton').onclick = () => { resetForm(); $('editor').scrollIntoView({behavior:'smooth'}); }; $('cancelButton').onclick = resetForm; $('logout').onclick = () => { clear(); location.href = '/ekodichurch'; }; await load(); setState('관리 가능','ok'); } catch (error) { setState(error.message,'error'); } }
  boot();
}

export function renderAdminHistory() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>역사 아카이브 · 에코디교회 관리자</title>
<style>
:root{--ink:#17221d;--muted:#667168;--line:#dfe5e1;--bg:#f4f6f4;--card:#fff;--green:#1f6a4b;--red:#a43636}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,"Noto Sans KR",system-ui,sans-serif}.wrap{width:min(1180px,calc(100% - 28px));margin:auto}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 0}.top a{text-decoration:none;color:inherit}.top h1{font-size:20px;margin:0}.top-actions{display:flex;gap:8px}.button,button{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;padding:9px 12px;font:inherit;font-size:13px;cursor:pointer;text-decoration:none}.button.primary,button.primary{background:var(--green);color:#fff;border-color:var(--green)}button.danger{color:var(--red)}.hero{display:flex;justify-content:space-between;align-items:end;gap:20px;background:#173e2e;color:#fff;border-radius:22px;padding:28px;margin-bottom:18px}.hero h2{font-size:30px;letter-spacing:-.04em;margin:0 0 7px}.hero p{margin:0;color:#d8e5dd}.hero-meta{display:flex;gap:8px;flex-wrap:wrap}.hero-meta span{font-size:12px;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:6px 9px}.toolbar{display:flex;gap:10px;align-items:center;margin:16px 0}.toolbar input{flex:1;min-width:0;padding:11px 13px;border:1px solid var(--line);border-radius:11px;background:#fff}.toolbar small{color:var(--muted)}.layout{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:18px;align-items:start}.panel{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px}.records{display:grid;gap:10px}.record{border:1px solid var(--line);border-radius:15px;padding:15px}.record-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.record-actions{display:flex;gap:6px}.record h3{font-size:17px;margin:8px 0 5px;letter-spacing:-.025em}.record p{margin:0;color:#465149;font-size:13px;line-height:1.55}.record small{display:block;margin-top:8px;color:var(--muted)}.date{font-weight:800;font-size:12px}.badge{display:inline-block;border-radius:999px;background:#edf4ef;color:#356348;padding:3px 7px;font-size:10px;font-weight:750}.badge.contextual{background:#edf3f8;color:#456987}.badge.needs-review{background:#fff3d5;color:#805a0e}.badge.oral-history{background:#f3edf8;color:#6a4984}.badge.private{background:#f1f1f1;color:#666}.editor{position:sticky;top:12px}.editor h2{font-size:18px;margin:0 0 14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.field{display:grid;gap:5px;margin-bottom:10px}.field.full{grid-column:1/-1}.field span{font-size:11px;color:var(--muted);font-weight:700}.field input,.field select,.field textarea{width:100%;border:1px solid var(--line);border-radius:9px;padding:9px 10px;background:#fff;font:inherit;font-size:13px}.field textarea{resize:vertical;min-height:72px}.check{display:flex;align-items:center;gap:7px;font-size:12px;margin:6px 0 14px}.form-actions{display:flex;gap:8px}.state{min-height:22px;margin:13px 0;color:var(--muted);font-size:12px}.state[data-type=ok]{color:var(--green)}.state[data-type=error]{color:var(--red)}.empty{padding:35px;text-align:center;color:var(--muted)}.note{margin-top:14px;padding:12px;border-radius:12px;background:#f7f8f7;color:var(--muted);font-size:11px;line-height:1.5}@media(max-width:900px){.layout{grid-template-columns:1fr}.editor{position:static}.hero{display:block}.hero-meta{margin-top:16px}}@media(max-width:600px){.wrap{width:min(100% - 18px,1180px)}.grid{grid-template-columns:1fr}.record-head{align-items:flex-start}.record-actions{flex-direction:column}.top{align-items:flex-start}.top-actions{flex-wrap:wrap;justify-content:flex-end}}
</style></head><body>
<div class="wrap">
<header class="top"><a href="/ekodichurch/admin/overview"><h1>에코디교회 관리자 · 역사 아카이브</h1></a><div class="top-actions"><a class="button" href="/ekodichurch/history" target="_blank" rel="noopener">공개 화면</a><a class="button" href="/ekodichurch/admin/overview">관리자 홈</a><button id="logout" type="button">로그아웃</button></div></header>
<section class="hero"><div><h2>지나온 길 기록관리</h2><p>사실·맥락·구술·검토 필요 기록을 구분하고, 공개 여부를 기록 단위로 관리합니다.</p></div><div class="hero-meta"><span id="role">권한 확인 중</span><span id="writeMode">확인 중</span></div></section>
<div class="toolbar"><input id="filter" type="search" placeholder="연도·조직·제목·검증상태 검색"><small id="count">0개</small><button id="newButton" class="primary" type="button">새 기록</button></div>
<div class="layout"><section class="panel"><div id="records" class="records"><div class="empty">기록을 불러오는 중입니다.</div></div></section>
<aside class="panel editor"><h2 id="editorTitle">새 기록</h2><form id="editor">
<input id="entryId" name="entryId" type="hidden">
<div class="grid">
<label class="field"><span>시작일</span><input id="startDate" name="startDate" type="date"></label><label class="field"><span>종료일</span><input id="endDate" name="endDate" type="date"></label>
<label class="field full"><span>화면 날짜표시</span><input id="dateLabel" name="dateLabel" placeholder="예: 2018년 3월 14일"></label>
<label class="field"><span>시대·장</span><input id="era" name="era" placeholder="예: 대학·지역 협력선교"></label><label class="field"><span>조직·주체</span><input id="organization" name="organization"></label>
<label class="field"><span>관계유형</span><input id="relationType" name="relationType" placeholder="예: organizational-predecessor"></label><label class="field"><span>기록유형</span><input id="kind" name="kind" value="milestone"></label>
<label class="field full"><span>제목</span><input id="title" name="title" required></label>
<label class="field full"><span>요약</span><textarea id="summary" name="summary" required></textarea></label>
<label class="field full"><span>상세 기록</span><textarea id="bodyText" name="bodyText"></textarea></label>
<label class="field"><span>장소</span><input id="place" name="place"></label><label class="field"><span>관련 인물·그룹</span><input id="peopleText" name="peopleText"></label>
<label class="field full"><span>근거자료 제목</span><input id="sourceTitle" name="sourceTitle"></label>
<label class="field"><span>근거자료 유형</span><input id="sourceType" name="sourceType" value="document"></label><label class="field"><span>내부 자료참조</span><input id="sourceRef" name="sourceRef" placeholder="공개 화면에는 표시되지 않음"></label>
<label class="field"><span>검증상태</span><select id="verificationStatus" name="verificationStatus"><option value="documented">문서 확인</option><option value="contextual">맥락 기록</option><option value="oral-history">구술 기록</option><option value="needs-review" selected>추가 검토</option></select></label>
<label class="field"><span>공개상태</span><select id="visibility" name="visibility"><option value="private" selected>비공개</option><option value="public">공개</option></select></label>
<label class="field full"><span>검증 메모</span><textarea id="verificationNote" name="verificationNote"></textarea></label>
<label class="field"><span>정렬순서</span><input id="sortOrder" name="sortOrder" type="number" step="1" value="0"></label>
</div>
<label class="check"><input id="featured" name="featured" type="checkbox"> 주요 이정표로 강조</label>
<div class="form-actions"><button id="saveButton" class="primary" type="submit">기록 추가</button><button id="cancelButton" type="button">초기화</button></div>
<div id="state" class="state">인증 확인 중…</div><div class="note">새 기록은 기본 비공개입니다. 공개로 변경한 기록만 「지나온 길」에 노출됩니다. 내부 자료참조와 검증 메모는 공개 페이지에 표시하지 않습니다.</div>
</form></aside></div></div>
<script>(${adminClient.toString()})()</script>
</body></html>`;
}

function bearer(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

async function session(request) {
  const token = bearer(request);
  if (!token || token.length > 8192) return { response: responseJson({ error: '목회자 인증이 필요합니다.' }, 401, request.method) };
  const identityResponse = await fetch(`${CENTRAL_SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: CENTRAL_PUBLISHABLE_KEY, authorization: `Bearer ${token}` }, cache: 'no-store'
  });
  const identity = identityResponse.ok ? await identityResponse.json().catch(() => null) : null;
  if (!identity?.id || !identity?.email || !identity?.email_confirmed_at) return { response: responseJson({ error: '목회자 인증을 확인할 수 없습니다.' }, 401, request.method) };
  const staffUrl = new URL(CHURCH_PASTOR_API);
  staffUrl.searchParams.set('table', 'church_staff');
  staffUrl.searchParams.set('user_id', `eq.${identity.id}`);
  staffUrl.searchParams.set('limit', '1');
  const staffResponse = await fetch(staffUrl.toString(), { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, cache: 'no-store' });
  const rows = staffResponse.ok ? await staffResponse.json().catch(() => []) : [];
  const staff = rows?.[0] || null;
  if (!staff) return { response: responseJson({ error: '에코디교회 목회자 운영권한이 필요합니다.' }, staffResponse.status === 401 ? 401 : 403, request.method) };
  return { data: { userId: String(identity.id), email: String(identity.email).toLowerCase(), role: clean(staff.role, 80), displayName: clean(staff.display_name, 160) } };
}

function roleLabel(role) {
  return ({ senior_pastor:'담임목회자', pastor:'목회자', care_staff:'돌봄 담당', staff:'운영 담당', viewer:'조회 담당' })[role] || role || '교회 담당자';
}

function rowToEntry(row, includePrivate = false) {
  const entry = {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    dateLabel: row.date_label,
    era: row.era,
    organization: row.organization,
    relationType: row.relation_type,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    bodyText: row.body_text,
    place: row.place,
    peopleText: row.people_text,
    verificationStatus: row.verification_status,
    visibility: row.visibility,
    featured: Boolean(row.featured),
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includePrivate) {
    entry.sourceTitle = row.source_title;
    entry.sourceType = row.source_type;
    entry.sourceRef = row.source_ref;
    entry.verificationNote = row.verification_note;
    entry.updatedBy = row.updated_by;
  }
  return entry;
}

function normalizeEntry(body = {}, existing = {}) {
  const verificationStatus = VALID_VERIFICATION.has(body.verificationStatus) ? body.verificationStatus : (existing.verificationStatus || 'needs-review');
  const visibility = VALID_VISIBILITY.has(body.visibility) ? body.visibility : (existing.visibility || 'private');
  return {
    startDate: clean(body.startDate ?? existing.startDate, 10),
    endDate: clean(body.endDate ?? existing.endDate, 10),
    dateLabel: clean(body.dateLabel ?? existing.dateLabel, 120),
    era: clean(body.era ?? existing.era, 160),
    organization: clean(body.organization ?? existing.organization, 300),
    relationType: clean(body.relationType ?? existing.relationType, 100),
    kind: clean(body.kind ?? existing.kind, 100) || 'milestone',
    title: clean(body.title ?? existing.title, 300),
    summary: clean(body.summary ?? existing.summary, 4000),
    bodyText: clean(body.bodyText ?? existing.bodyText, 20000),
    place: clean(body.place ?? existing.place, 500),
    peopleText: clean(body.peopleText ?? existing.peopleText, 1000),
    sourceTitle: clean(body.sourceTitle ?? existing.sourceTitle, 1000),
    sourceType: clean(body.sourceType ?? existing.sourceType, 100) || 'document',
    sourceRef: clean(body.sourceRef ?? existing.sourceRef, 1000),
    verificationStatus,
    verificationNote: clean(body.verificationNote ?? existing.verificationNote, 4000),
    visibility,
    featured: body.featured === undefined ? Boolean(existing.featured) : Boolean(body.featured),
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : Number(existing.sortOrder || 0),
  };
}

async function audit(env, sessionData, entryId, action, detail = '') {
  await env.DB.prepare('INSERT INTO church_history_audit_logs (entry_id, actor_email, actor_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(clean(entryId, 160), clean(sessionData.email, 320), clean(sessionData.userId, 160), action, clean(detail, 2000), new Date().toISOString()).run();
}

async function listPublic(env) {
  const result = await env.DB.prepare("SELECT * FROM church_history_entries WHERE visibility='public' ORDER BY sort_order ASC, start_date ASC, created_at ASC").all();
  return result.results || [];
}

async function getEntry(env, id) {
  const row = await env.DB.prepare('SELECT * FROM church_history_entries WHERE id=?').bind(id).first();
  return row ? rowToEntry(row, true) : null;
}

async function apiList(request, env, sessionData) {
  const result = await env.DB.prepare('SELECT * FROM church_history_entries ORDER BY sort_order ASC, start_date ASC, created_at ASC').all();
  return responseJson({ entries:(result.results || []).map(row => rowToEntry(row, true)), role:sessionData.role, roleLabel:roleLabel(sessionData.role), canWrite:WRITE_ROLES.has(sessionData.role) }, 200, request.method);
}

function createId(entry) {
  const base = (entry.startDate || new Date().toISOString().slice(0, 10)) + '-' + (entry.title || 'history');
  const slug = base.toLowerCase().replace(/[^0-9a-z가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'history';
  return `${slug}-${crypto.randomUUID().slice(0, 8)}`;
}

async function apiCreate(request, env, sessionData) {
  if (!WRITE_ROLES.has(sessionData.role)) return responseJson({ error:'기록을 편집할 권한이 없습니다.' }, 403, request.method);
  const body = await request.json().catch(() => null);
  if (!body) return responseJson({ error:'기록 내용을 확인해 주세요.' }, 400, request.method);
  const entry = normalizeEntry(body);
  if (!entry.title || !entry.summary) return responseJson({ error:'제목과 요약은 필수입니다.' }, 400, request.method);
  const id = clean(body.entryId, 120) || createId(entry);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO church_history_entries
    (id,start_date,end_date,date_label,era,organization,relation_type,kind,title,summary,body_text,place,people_text,source_title,source_type,source_ref,verification_status,verification_note,visibility,featured,sort_order,created_at,updated_at,updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,entry.startDate,entry.endDate,entry.dateLabel,entry.era,entry.organization,entry.relationType,entry.kind,entry.title,entry.summary,entry.bodyText,entry.place,entry.peopleText,entry.sourceTitle,entry.sourceType,entry.sourceRef,entry.verificationStatus,entry.verificationNote,entry.visibility,entry.featured?1:0,entry.sortOrder,now,now,sessionData.userId).run();
  await audit(env, sessionData, id, 'church.history.create', JSON.stringify({ visibility:entry.visibility, verificationStatus:entry.verificationStatus }));
  return responseJson({ ok:true, entry:await getEntry(env,id) }, 201, request.method);
}

async function apiUpdate(request, env, sessionData, id) {
  if (!WRITE_ROLES.has(sessionData.role)) return responseJson({ error:'기록을 편집할 권한이 없습니다.' }, 403, request.method);
  const current = await getEntry(env, id);
  if (!current) return responseJson({ error:'역사 기록을 찾을 수 없습니다.' }, 404, request.method);
  const body = await request.json().catch(() => null);
  if (!body) return responseJson({ error:'기록 내용을 확인해 주세요.' }, 400, request.method);
  const entry = normalizeEntry(body, current);
  if (!entry.title || !entry.summary) return responseJson({ error:'제목과 요약은 필수입니다.' }, 400, request.method);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE church_history_entries SET start_date=?,end_date=?,date_label=?,era=?,organization=?,relation_type=?,kind=?,title=?,summary=?,body_text=?,place=?,people_text=?,source_title=?,source_type=?,source_ref=?,verification_status=?,verification_note=?,visibility=?,featured=?,sort_order=?,updated_at=?,updated_by=? WHERE id=?`)
    .bind(entry.startDate,entry.endDate,entry.dateLabel,entry.era,entry.organization,entry.relationType,entry.kind,entry.title,entry.summary,entry.bodyText,entry.place,entry.peopleText,entry.sourceTitle,entry.sourceType,entry.sourceRef,entry.verificationStatus,entry.verificationNote,entry.visibility,entry.featured?1:0,entry.sortOrder,now,sessionData.userId,id).run();
  await audit(env, sessionData, id, 'church.history.update', JSON.stringify({ visibility:entry.visibility, verificationStatus:entry.verificationStatus }));
  return responseJson({ ok:true, entry:await getEntry(env,id) }, 200, request.method);
}

async function apiDelete(request, env, sessionData, id) {
  if (!WRITE_ROLES.has(sessionData.role)) return responseJson({ error:'기록을 삭제할 권한이 없습니다.' }, 403, request.method);
  const current = await getEntry(env, id);
  if (!current) return responseJson({ error:'역사 기록을 찾을 수 없습니다.' }, 404, request.method);
  await env.DB.prepare('DELETE FROM church_history_entries WHERE id=?').bind(id).run();
  await audit(env, sessionData, id, 'church.history.delete', JSON.stringify({ title:current.title, visibility:current.visibility }));
  return responseJson({ ok:true }, 200, request.method);
}

async function handleApi(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:{'access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type','cache-control':'no-store'} });
  const auth = await session(request);
  if (auth.response) return auth.response;
  const suffix = url.pathname.slice(API_PREFIX.length).replace(/^\/+/, '');
  if (!suffix) {
    if (request.method === 'GET' || request.method === 'HEAD') return apiList(request, env, auth.data);
    if (request.method === 'POST') return apiCreate(request, env, auth.data);
    return responseJson({ error:'허용되지 않은 요청입니다.' }, 405, request.method);
  }
  const id = decodeURIComponent(suffix.split('/')[0]);
  if (!id) return responseJson({ error:'기록 ID가 필요합니다.' }, 400, request.method);
  if (request.method === 'PUT') return apiUpdate(request, env, auth.data, id);
  if (request.method === 'DELETE') return apiDelete(request, env, auth.data, id);
  if (request.method === 'GET' || request.method === 'HEAD') {
    const entry = await getEntry(env,id);
    return entry ? responseJson({ entry, role:auth.data.role }, 200, request.method) : responseJson({ error:'역사 기록을 찾을 수 없습니다.' }, 404, request.method);
  }
  return responseJson({ error:'허용되지 않은 요청입니다.' }, 405, request.method);
}

function pathMatches(pathname, base) {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  return cleanPath === base || cleanPath === `${base}/`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) return await handleApi(request, env, url);
      if (pathMatches(url.pathname, ADMIN_PATH)) {
        if (!['GET','HEAD'].includes(request.method)) return responseJson({ error:'허용되지 않은 요청입니다.' }, 405, request.method);
        return responseHtml(renderAdminHistory(), 200, request.method);
      }
      if (pathMatches(url.pathname, PUBLIC_PATH)) {
        if (!['GET','HEAD'].includes(request.method)) return responseJson({ error:'허용되지 않은 요청입니다.' }, 405, request.method);
        const entries = await listPublic(env);
        return responseHtml(renderPublicHistory(entries), 200, request.method);
      }
      return responseJson({ error:'not_found' }, 404, request.method);
    } catch (error) {
      console.error('church-history-worker', error);
      if (url.pathname === PUBLIC_PATH || url.pathname === `${PUBLIC_PATH}/`) {
        return responseHtml(renderPublicHistory([]), 503, request.method);
      }
      return responseJson({ error:'역사 아카이브 처리 중 오류가 발생했습니다.' }, 500, request.method);
    }
  }
};
