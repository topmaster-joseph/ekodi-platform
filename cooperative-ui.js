import { COOP_DOCUMENTS } from './cooperative-registry.js';

export function cooperativeCss() {
  return `
:root{--ink:#173c32;--accent:#1e654d;--accent-light:#e6efe8;--paper:#fbfaf6;--muted:#677a70;--line:#dce4dc;--gold:#bd985b;--white:#fff;--radius:20px;font-family:"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;color:var(--ink);background:var(--paper);font-synthesis:none}*{box-sizing:border-box}body{margin:0;font-size:15px;line-height:1.65}.tone-open{--ink:#1c3b4c;--accent:#245c78;--accent-light:#e6eef2;--muted:#667b86;--line:#dce4e8}a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}button,a,input,textarea,select{-webkit-tap-highlight-color:transparent}button{cursor:pointer}button:disabled{cursor:wait;opacity:.6}a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid var(--gold);outline-offset:3px}.wrap{width:min(1180px,calc(100% - 64px));margin-inline:auto}.skip{position:fixed;top:-80px;left:20px;z-index:100;background:var(--ink);color:#fff;padding:12px}.skip:focus{top:8px}.site-header{background:rgba(251,250,246,.96);border-bottom:1px solid var(--line)}.header-inner{min-height:96px;display:flex;align-items:center;justify-content:space-between;gap:24px}.brand{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:800;letter-spacing:-.045em;flex-shrink:0}.brand-mark{display:grid;place-items:center;width:43px;height:43px;border:1px solid var(--accent);border-radius:50%;color:var(--accent);font-family:serif;font-size:25px}.brand small{display:block;font-size:10px;font-weight:500;letter-spacing:.1em;color:var(--muted);margin-top:1px}nav{display:flex;align-items:center;gap:28px;font-size:13px;font-weight:650}nav a:hover{color:var(--accent);text-decoration:underline;text-underline-offset:6px}.nav-action{border:1px solid var(--line);padding:9px 14px;border-radius:9px}.hero{display:grid;grid-template-columns:1.1fr 1fr;align-items:center;gap:28px;min-height:560px;padding-top:46px;padding-bottom:44px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.15em;color:var(--accent);margin:0 0 14px}.hero h1{font-family:Georgia,"Noto Serif KR",serif;font-size:clamp(35px,4.5vw,61px);font-weight:600;letter-spacing:-.07em;line-height:1.28;margin:0 0 24px}.hero h1 em{font-style:normal;color:var(--accent)}.hero-description{max-width:460px;font-size:16px;color:var(--muted);line-height:1.9;margin:0 0 27px}.actions{display:flex;flex-wrap:wrap;gap:11px}.button{display:inline-flex;align-items:center;justify-content:center;gap:18px;min-height:43px;padding:10px 18px;border:1px solid transparent;border-radius:8px;font-size:13px;font-weight:700}.button.primary{background:var(--accent);color:#fff}.button.secondary{background:transparent;border-color:var(--line);color:var(--ink)}.button:hover{filter:brightness(.94)}.hero-note{font-size:11px;color:var(--muted);margin-top:21px}.hero-note span{margin-inline:8px}.hero-visual{position:relative;min-width:0;margin:0}.hero-photo{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius);background:var(--accent-light)}.art-caption{font-size:11px;color:var(--muted);padding:10px 2px 0;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:7px}.dot{width:6px;height:6px;border-radius:50%;background:var(--accent)}.principles{border-top:1px solid var(--line);border-bottom:1px solid var(--line);display:grid;grid-template-columns:repeat(3,1fr);padding-block:22px}.principles div{display:flex;flex-direction:column;gap:5px;padding-left:30px;border-left:1px solid var(--line)}.principles div:first-child{border-left:0;padding-left:0}.principles strong{font-size:15px}.principles span{color:var(--muted);font-size:12px}.section{padding-block:68px}.section-heading{margin-bottom:30px}.section-heading h2{font-family:Georgia,"Noto Serif KR",serif;font-size:32px;line-height:1.4;letter-spacing:-.055em;font-weight:600;margin:0}.row-heading{display:flex;justify-content:space-between;align-items:end;gap:20px}.row-heading>p{color:var(--muted);font-size:12px;margin:0}.about-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:100px}.large-copy{font-size:21px;line-height:1.85;letter-spacing:-.045em;margin:0}.about-detail>p{display:flex;justify-content:space-between;gap:24px;font-size:13px;margin:0;padding-block:12px;border-bottom:1px solid var(--line)}.about-detail>p>span{color:var(--muted)}.about-detail>p.muted{font-size:11px;display:block;border:0;margin-top:8px}.soft{background:#f0f2eb}.tone-open .soft{background:#eef2f3}.business-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.business-card{background:var(--paper);overflow:hidden;border-radius:var(--radius);border:1px solid var(--line);min-height:240px}.business-photo{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;background:var(--accent-light)}.business-copy{padding:22px 26px 26px;word-break:keep-all}.business-photo-caption{font-size:11px;margin:16px 0 0}.card-index{color:var(--gold);font-family:Georgia,serif;font-size:23px}.business-card h3{font-size:19px;letter-spacing:-.04em;margin:20px 0 10px}.business-card p{font-size:13px;color:var(--muted)}.card-tag{display:inline-block;border-top:1px solid var(--line);padding-top:13px;font-size:10px;color:var(--accent);margin-top:16px}.business-description{font-size:11px;margin:20px 0 0}.journey{display:grid;grid-template-columns:repeat(4,1fr);padding:0;list-style:none;gap:24px}.journey li{border-top:2px solid var(--line);padding-top:16px}.journey span{color:var(--accent);font-size:12px;font-weight:800}.journey h3{font-size:16px;letter-spacing:-.04em;margin:14px 0 10px}.journey p{color:var(--muted);font-size:12px}.notice-list{display:grid;gap:12px}.notice-list article{border:1px solid var(--line);border-radius:12px;padding:23px 25px;background:#fff}.notice-list h3{font-size:16px;margin:11px 0 6px}.notice-list p{font-size:12px;color:var(--muted);margin:0;white-space:pre-wrap}.badge{display:inline-flex;align-items:center;border-radius:30px;background:var(--accent-light);color:var(--accent);font-size:10px;font-weight:750;padding:4px 10px}.join-banner{display:flex;justify-content:space-between;align-items:center;gap:26px;padding:32px 36px;background:var(--accent-light);border-radius:var(--radius);margin-bottom:70px}.join-banner h2{font-size:24px;letter-spacing:-.05em;margin:0 0 6px}.join-banner p:not(.eyebrow){color:var(--muted);font-size:12px;margin:0}.site-footer{border-top:1px solid var(--line);padding-block:32px}.footer-inner{display:grid;grid-template-columns:1fr auto;gap:20px}.site-footer strong{font-size:16px}.site-footer p{font-size:11px;margin:7px 0}.footer-links{display:flex;gap:18px;font-size:11px;flex-wrap:wrap;align-items:start}.copyright{grid-column:1/-1;color:var(--muted);border-top:1px solid var(--line);padding-top:18px}.muted{color:var(--muted)}.quiet{background:transparent;border:1px solid var(--line);border-radius:8px;font-size:12px;padding:7px 12px;color:var(--ink)}[hidden]{display:none!important}.private-main{padding-block:34px;min-height:60vh}.workspace-heading{display:flex;justify-content:space-between;align-items:start;gap:18px;margin-bottom:18px}.workspace-heading h1{font-size:30px;letter-spacing:-.05em;margin:0 0 7px}.workspace-heading p:not(.eyebrow){font-size:13px;color:var(--muted);margin:0}.status-message{font-size:12px;color:var(--muted);min-height:28px;white-space:pre-wrap}.status-message.error{color:#a34336}.card{border:1px solid var(--line);background:#fff;border-radius:14px;padding:24px;margin-bottom:18px;min-width:0}.card h2{font-size:19px;margin:0 0 13px;letter-spacing:-.04em}.card h3{font-size:15px}.card p{font-size:13px}.gate{max-width:680px;margin:26px auto}.gate .button{margin:10px 8px 0 0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}.stat{border:1px solid var(--line);border-radius:12px;background:#fff;padding:18px}.stat b{display:block;font-size:24px;letter-spacing:-.05em}.stat span{font-size:11px;color:var(--muted)}.tabs{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0 20px;padding-bottom:14px;border-bottom:1px solid var(--line)}.tabs button{background:transparent;border:1px solid var(--line);border-radius:8px;padding:8px 13px;font-size:12px;color:var(--ink)}.tabs button[aria-selected="true"]{background:var(--accent);border-color:var(--accent);color:#fff}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.form-grid label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:650}.full{grid-column:1/-1}.form-grid input,.form-grid textarea,.form-grid select,.table input,.table select{width:100%;min-width:0;border:1px solid var(--line);border-radius:7px;background:#fff;padding:9px 10px;color:var(--ink);font-size:13px}.form-grid textarea{min-height:85px;resize:vertical}.form-grid .checkbox{flex-direction:row;align-items:center;font-weight:400}.checkbox input{width:auto}.form-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:18px}.table-wrap{overflow-x:auto}.table{width:100%;border-collapse:collapse;font-size:12px}.table th{text-align:left;color:var(--muted);font-size:10px;letter-spacing:.02em;padding:10px;border-bottom:1px solid var(--line)}.table td{padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top}.table input{min-width:135px}.table input[type="number"]{min-width:80px}.table small{display:block;color:var(--muted);font-size:10px;margin-top:4px}.table-select{min-width:90px}.notice-small{font-size:11px;color:var(--muted);border-left:3px solid var(--gold);padding:10px 14px;background:var(--paper);margin:16px 0}.check-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.check-item{padding:14px;border:1px solid var(--line);border-radius:9px}.check-item label{display:block;font-size:13px;margin-bottom:8px}.check-item select,.check-item input{width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;font:inherit;font-size:12px}.check-item input{margin-top:8px}.empty{color:var(--muted);padding:20px;font-size:13px;border:1px dashed var(--line);border-radius:10px}.record-list{display:grid;gap:10px;margin-top:18px}.record{padding:16px 18px;border:1px solid var(--line);border-radius:9px}.record h3{margin:0 0 8px}.record p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0;color:var(--muted);font-size:12px}.record .row{display:flex;gap:8px;justify-content:space-between;align-items:center}.record .quiet{font-size:10px}.deadline-list{list-style:none;padding:0;display:grid;gap:8px}.deadline-list li{display:flex;justify-content:space-between;gap:18px;padding:12px 0;border-bottom:1px solid var(--line);font-size:12px}.member-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:18px}.member-grid>.card{margin:0}.status-tag{font-size:10px;background:var(--paper);border:1px solid var(--line);padding:3px 6px;border-radius:6px}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.toolbar p{font-size:11px;margin:0;color:var(--muted)}.form-help{font-size:11px!important;color:var(--muted)}
@media(max-width:950px){.wrap{width:calc(100% - 40px)}.brand{font-size:17px}.header-inner{min-height:88px;gap:18px}nav{gap:14px;font-size:11px}.hero{min-height:490px;gap:15px}.hero-description{font-size:14px}.about-grid{gap:45px}.business-copy{padding:22px}.footer-links{gap:12px}}
@media(max-width:680px){.wrap{width:calc(100% - 32px)}.header-inner{align-items:stretch;flex-direction:column;gap:12px;padding-block:17px;min-height:0}.brand{font-size:19px}.brand-mark{width:36px;height:36px;font-size:22px}nav{gap:14px;flex-wrap:wrap;justify-content:space-between;font-size:11px}.nav-action{padding:6px 9px}.hero{grid-template-columns:1fr;gap:0;min-height:0;padding-top:37px;padding-bottom:28px}.hero h1{font-size:42px;line-height:1.3;margin-bottom:20px}.hero-description{max-width:100%;font-size:14px;line-height:1.8}.hero-visual{margin-top:16px}.art-caption{font-size:10px}.hero-note{margin-top:15px}.principles{padding-block:17px;gap:10px}.principles div,.principles div:first-child{padding-left:10px}.principles div:first-child{padding-left:0}.principles strong{font-size:12px}.principles span{font-size:10px;line-height:1.6}.section{padding-block:39px}.section-heading{margin-bottom:22px}.section-heading h2{font-size:27px}.about-grid{grid-template-columns:1fr;gap:24px}.large-copy{font-size:18px}.about-detail>p{font-size:12px;padding-block:10px}.row-heading{display:block}.row-heading>p{margin-top:12px}.business-grid{grid-template-columns:1fr;gap:13px}.business-card{min-height:0}.business-copy{padding:22px}.business-card h3{margin-top:10px;font-size:19px}.business-card p{font-size:12px}.card-index{font-size:19px}.card-tag{margin-top:8px}.journey{grid-template-columns:1fr 1fr;gap:22px}.journey h3{font-size:14px;margin-top:10px}.journey p{font-size:11px}.notice-list article{padding:19px}.join-banner{display:block;padding:26px;margin-bottom:40px}.join-banner h2{font-size:21px}.join-banner .button{margin-top:20px}.footer-inner{grid-template-columns:1fr;gap:15px}.footer-links{gap:15px;font-size:10px}.stats{grid-template-columns:1fr 1fr;gap:10px}.stat{padding:15px}.stat b{font-size:21px}.workspace-heading h1{font-size:26px}.workspace-heading>.badge{white-space:nowrap}.workspace-heading p:not(.eyebrow){font-size:12px}.private-main{padding-top:26px}.form-grid{grid-template-columns:1fr}.card{padding:19px}.member-grid,.check-grid{grid-template-columns:1fr}.tabs{gap:5px}.tabs button{font-size:11px;padding:7px 10px}.table td{padding:10px 7px}.table{font-size:11px}.form-help{font-size:10px!important}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
@media print{nav,.tabs,.form-actions,button,.gate,.site-footer{display:none!important}.wrap{width:100%}.site-header{position:static}.card{break-inside:avoid;border-color:#aaa}body{background:#fff;color:#111}.table-wrap{overflow:visible}.table input{min-width:0}.private-main{min-height:0}}
`;
}

function clientMain(documents) {
  'use strict';
  const root = document.documentElement;
  const slug = root.dataset.coopSlug;
  const surface = root.dataset.coopSurface;
  const platform = root.dataset.coopPlatform === 'true';
  const hub = surface === 'hub';
  const base = hub ? '/business-coop' : `/${slug}`;
  const apiBase = hub ? (platform ? '/api/control/cooperatives' : '/api/cooperatives') : platform ? `/api/control/cooperatives/${slug}` : `${base}/api`;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = value => Number(value || 0).toLocaleString('ko-KR') + '원';
  const SESSION_KEY = 'ekodi-cooperative-auth.v1';
  const SUPABASE = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const errors = {
    COOP_REVISION_CONFLICT: '다른 기기에서 내용이 변경되었습니다. 현재 입력 내용을 확인한 뒤 새로 불러와 주세요.',
    COOP_ACCOUNT_GRANT_REQUIRED: '계정 연결 전에 해당 이메일의 조합별 접근권한을 등록해 주세요.',
    COOP_CAPITAL_LIMIT: '한 조합원의 출자좌수는 전체의 30%를 넘을 수 없습니다.',
    COOP_DUPLICATE_ACCOUNT: '각 대표자에게 서로 다른 계정을 연결해 주세요.',
    COOP_LEGAL_NAME_REQUIRED: '설립용 법인명에는 “협동조합” 문자가 필요합니다.',
    COOP_PROJECT_NOT_PROVISIONED: '조합 저장공간 준비가 아직 완료되지 않았습니다.',
    COOP_DATABASE_UNAVAILABLE: '저장 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    COOP_SERVICE_UNAVAILABLE: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    COOP_INVALID_NUMBER: '출자좌수와 금액을 올바른 숫자로 입력해 주세요.',
    COOP_INVALID_DATE: '날짜를 확인해 주세요.',
    COOP_ACCOUNT_NOT_LINKED: '관리자가 이 대표자 명부와 로그인 계정을 연결해야 합니다.',
  };
  let token = '';
  let project = null;
  let currentTab = 'overview';
  let saving = false;
  const dirtyForms = new Set();
  const editingRecords = new Map();
  const recordForms = { notices: 'noticeForm', meetings: 'meetingForm', supports: 'supportForm' };

  function formDrafts(exclude = '') {
    const result = {};
    for (const id of dirtyForms) {
      const form = document.getElementById(id);
      if (form && id !== exclude) result[id] = [...form.elements].map(el => ({ value: el.value, checked: el.checked }));
    }
    return result;
  }
  function restoreDrafts(drafts) {
    for (const [id, values] of Object.entries(drafts)) {
      const form = document.getElementById(id);
      if (form) [...form.elements].forEach((el, index) => { if (values[index] && el.tagName !== 'BUTTON') { el.value = values[index].value; if (el.type === 'checkbox') el.checked = values[index].checked; } });
    }
    for (const [kind] of editingRecords) {
      const button = document.getElementById(recordForms[kind])?.querySelector('button[type="submit"]');
      if (button) button.textContent = '수정 저장';
    }
  }

  function setStatus(message, error = false) {
    const el = $('#status');
    if (el) { el.textContent = message; el.classList.toggle('error', error); }
  }
  function loginUrl() {
    const url = new URL('/auth/', 'https://ekodi.kr');
    url.searchParams.set('site', 'portal');
    url.searchParams.set('direct', '1');
    url.searchParams.set('return_to', 'https://ekodi.kr' + location.pathname + location.search);
    return url.href;
  }
  async function authRequest(path, body) {
    const response = await fetch(SUPABASE + path, { method: 'POST', headers: { apikey: PUBLISHABLE_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) throw new Error('LOGIN_HANDOFF_FAILED');
    const session = { accessToken: data.access_token, refreshToken: data.refresh_token || '', expiresAt: Number(data.expires_at) || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }
  async function accessToken() {
    if (platform) {
      const handoff = new URLSearchParams(location.hash.slice(1));
      const value = handoff.get('ekodi_admin_token');
      if (value) {
        if (value.length <= 8192) sessionStorage.setItem('ekodi-auth-token', value);
        history.replaceState(null, '', location.pathname + location.search);
      }
      return sessionStorage.getItem('ekodi-auth-token') || '';
    }
    let session = null;
    try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { sessionStorage.removeItem(SESSION_KEY); }
    const handoff = new URLSearchParams(location.hash.slice(1));
    if (handoff.get('ekodi_token')) {
      try { session = await authRequest('/auth/v1/verify', { token_hash: handoff.get('ekodi_token'), type: handoff.get('ekodi_type') || 'email' }); }
      finally { history.replaceState(null, '', location.pathname + location.search); }
    }
    if (!session?.accessToken) return '';
    if (Number(session.expiresAt) < Date.now() / 1000 + 60) {
      if (!session.refreshToken) { sessionStorage.removeItem(SESSION_KEY); return ''; }
      try { session = await authRequest('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refreshToken }); }
      catch { sessionStorage.removeItem(SESSION_KEY); return ''; }
    }
    return session.accessToken;
  }
  async function request(path, options = {}) {
    if (surface !== 'public') {
      token = await accessToken();
      if (!token) throw Object.assign(new Error('로그인이 만료되었습니다. 입력 내용을 확인한 뒤 다시 로그인해 주세요.'), { status: 401 });
    }
    const response = await fetch(apiBase + path, { ...options, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(errors[data.code] || '요청을 처리하지 못했습니다. 다시 확인해 주세요.'), { code: data.code, status: response.status });
    return data;
  }
  function authenticationFailure(error) {
    if (error.status !== 401 && error.status !== 403) return false;
    $('#workspace').hidden = true;
    $('#gate').hidden = false;
    $('#gateTitle').textContent = error.status === 401 ? '다시 로그인해 주세요' : '이 조합의 권한을 확인해 주세요';
    $('#gateMessage').textContent = '현재 입력한 내용은 저장되지 않았습니다. 로그인 또는 권한 확인 후 다시 불러와 주세요.';
    $('#loginLink').hidden = error.status === 403;
    if (error.status === 401) { sessionStorage.removeItem(SESSION_KEY); if (platform) sessionStorage.removeItem('ekodi-auth-token'); }
    setStatus($('#gateMessage').textContent, true);
    return true;
  }
  function field(label, name, value, { type = 'text', full = false, area = false } = {}) {
    return `<label${full ? ' class="full"' : ''}>${esc(label)}${area ? `<textarea name="${name}" maxlength="4000">${esc(value)}</textarea>` : `<input name="${name}" type="${type}" value="${esc(value)}"${type === 'number' ? ' min="0" step="1"' : ''}>`}</label>`;
  }
  function records(rows, kind) {
    return rows.length ? `<div class="record-list">${rows.map(row => `<article class="record"><div class="row"><h3>${esc(row.title)}</h3>${surface === 'admin' ? `<div class="actions"><button class="quiet" type="button" data-edit="${kind}" data-record="${esc(row.id)}">수정</button><button class="quiet" type="button" data-remove="${kind}" data-record="${esc(row.id)}">삭제</button></div>` : ''}</div><span class="status-tag">${esc({ draft: '초안', published: '게시됨' }[row.status] || row.status)}${row.visibility ? ' · ' + (row.visibility === 'public' ? '공개' : '조합원') : ''}</span><p>${esc(row.body || row.memo || '')}</p><small class="muted">${esc(row.date || row.deadline || '')} ${esc(row.agency || '')}</small></article>`).join('')}</div>` : '<p class="empty">등록된 내용이 없습니다.</p>';
  }
  async function download(path, filename) {
    token = await accessToken();
    if (!token) throw Object.assign(new Error('다시 로그인해 주세요.'), { status: 401 });
    const response = await fetch(apiBase + path, { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' });
    if (!response.ok) throw new Error('다운로드 권한 또는 서버 상태를 확인해 주세요.');
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = href; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  function datePlus(value, days) {
    if (!value) return '기준일 입력 후 계산';
    const date = new Date(value + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  function renderAdmin(drafts = {}) {
    const state = project.state;
    const p = state.profile;
    const capital = state.founders.reduce((sum, f) => sum + (f.shares || 0) * p.shareUnit, 0);
    const complete = Object.values(state.documents).filter(d => d.status === 'reviewed').length;
    const tabs = [['overview', '현황'], ['profile', '조합정보'], ['founders', '구성원·사업자'], ['documents', '설립서류'], ['schedule', '총회·신고 일정'], ['notices', '공지'], ['meetings', '회의록'], ['supports', '지원사업'], ['accounts', '계정·권한']];
    $('#workspace').innerHTML = `<div class="toolbar"><p>${esc(p.name)} · 서버 저장 · 수정본 ${project.revision}</p><div class="actions"><button class="quiet" id="reload" type="button">새로 불러오기</button><button class="quiet" id="export" type="button">현재 조합 내보내기</button><button class="quiet" id="print" type="button">인쇄</button></div></div><div class="stats"><div class="stat"><b>${state.founders.length}명</b><span>구성원 대표자 · 자격 확인 별도</span></div><div class="stat"><b>${state.founders.filter(f => f.business).length}/${state.founders.length}</b><span>사업자명 입력</span></div><div class="stat"><b>${won(capital)}</b><span>예정 출자 · 납입 확정 아님</span></div><div class="stat"><b>${complete}/8</b><span>설립서류 검토 완료</span></div></div><div class="tabs" role="tablist" aria-label="관리 분류">${tabs.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === currentTab}">${label}</button>`).join('')}</div>
    <section class="card" data-panel="overview"><h2>지금 확인할 일</h2><div class="notice-small">설립 준비중입니다. 대표자 명단은 참여 예정 정보이며, 법인 설립·임원 선출·출자 납입·가입 동의를 완료한 것으로 간주하지 않습니다.</div><ul><li>각 대표자의 사업자명·업종·조합원 자격 확인</li><li>주사무소·사업구역·관할 확정</li><li>조합원별 출자좌수와 초기 운영예산 합의</li><li>이사 3~5명(이사장 포함)·감사 1~2명 후보와 창립총회 준비</li><li>조합장 예정: ${esc(p.chair)} · 정관상 임원 임기 4년</li></ul><p class="form-help">지원사업 자격과 접수기간은 해당 공고를 기준으로 확인합니다. 설립만으로 지원이 확정되지 않습니다.</p></section>
    <section class="card" data-panel="profile"><h2>조합 기본정보</h2><form id="profileForm" class="form-grid">${field('표시 조합명', 'name', p.name)}${field('설립용 법인명(안)', 'legalName', p.legalName)}${field('조합장 예정', 'chair', p.chair)}${field('주사무소 소재지', 'office', p.office)}${field('사업구역', 'businessArea', p.businessArea)}${field('신고 관할 시·도', 'jurisdiction', p.jurisdiction)}${field('출자 1좌 금액(원)', 'shareUnit', p.shareUnit, { type: 'number' })}${field('첫해 운영예산(원) · 미정은 공란', 'firstYearBudget', p.firstYearBudget, { type: 'number' })}${field('목적', 'purpose', p.purpose, { full: true, area: true })}${field('조합원 자격·업종', 'industries', p.industries, { full: true, area: true })}${field('공동사업', 'businesses', p.businesses, { full: true, area: true })}<label>명칭 검토 상태<select name="legalNameStatus">${['draft', 'checking', 'confirmed'].map((v, i) => `<option value="${v}"${p.legalNameStatus === v ? ' selected' : ''}>${['정관 초안', '중복·사용 가능성 확인중', '명칭 확정'][i]}</option>`).join('')}</select></label><label class="checkbox"><input type="checkbox" name="officeConfirmed"${p.officeConfirmed ? ' checked' : ''}>주사무소 소재지 확정</label><button class="button primary" type="submit">조합정보 저장</button></form><p class="form-help">광주광역시는 첨부 정관의 참고값이며 현재 두 신규 조합의 확정 소재지가 아닙니다.</p></section>
    <section class="card" data-panel="founders"><h2>구성원 대표자·사업자 등록</h2><p class="form-help">사업자명은 공란으로 저장할 수 있습니다. 이남현1·2·3은 서로 다른 명부 항목입니다.</p><form id="foundersForm"><div class="table-wrap"><table class="table"><thead><tr><th>대표자</th><th>사업자명</th><th>업종</th><th>예정 출자좌수</th><th>설립동의</th></tr></thead><tbody>${state.founders.map(f => `<tr data-founder-id="${esc(f.id)}"><td><input data-key="representative" aria-label="대표자명" value="${esc(f.representative)}"><small>${f.position === 'chair-designate' ? '조합장 예정' : '구성원 대표자'}</small></td><td><input data-key="business" aria-label="${esc(f.representative)} 사업자명" placeholder="추후 등록" value="${esc(f.business)}"></td><td><input data-key="industry" aria-label="업종" placeholder="확인 전" value="${esc(f.industry)}"></td><td><input data-key="shares" aria-label="예정 출자좌수" type="number" min="1" step="1" placeholder="미정" value="${esc(f.shares)}"></td><td><select data-key="consent" aria-label="설립동의 상태"><option value="pending"${f.consent === 'pending' ? ' selected' : ''}>확인 전</option><option value="confirmed"${f.consent === 'confirmed' ? ' selected' : ''}>동의 확인</option></select></td></tr>`).join('')}</tbody></table></div><div class="form-actions"><button class="button primary" type="submit">구성원 정보 저장</button></div></form><p class="form-help">1좌 1만 원 · 1인 1좌 이상 · 한 조합원의 출자좌수는 전체의 30% 이하. 입력한 출자액은 예정 금액입니다.</p></section>
    <section class="card" data-panel="documents"><h2>설립신고 첨부서류 8종</h2><form id="documentsForm"><div class="check-grid">${documents.map(([id, label]) => `<div class="check-item"><label for="doc-${id}">${esc(label)}</label><select id="doc-${id}" name="${id}">${['pending', 'draft', 'prepared', 'reviewed'].map((s, i) => `<option value="${s}"${state.documents[id].status === s ? ' selected' : ''}>${['준비 전', '초안 작성', '서류 준비', '검토 완료'][i]}</option>`).join('')}</select><input name="${id}-note" aria-label="${esc(label)} 메모" placeholder="진행 메모" value="${esc(state.documents[id].note)}"></div>`).join('')}</div><div class="form-actions"><button class="button primary" type="submit">준비상태 저장</button><button class="button secondary" id="charter" type="button">이 조합 정관 초안 받기</button></div></form><p class="form-help">정관은 첨부 자료를 바탕으로 명칭·발기인·사업 범위를 반영한 검토용 초안입니다. 소재지·사업구역·임원과 최종 조문은 창립총회 전에 확인해야 합니다.</p></section>
    <section class="card" data-panel="schedule"><h2>총회·신고 일정</h2><form id="datesForm" class="form-grid">${Object.entries({ foundingMeetingDate: '창립총회 예정/개최일', filingDate: '설립신고 접수일', confirmationDate: '신고확인증 수령일', capitalPaidDate: '출자금 납입 완료일', registrationDate: '법인등기 완료일' }).map(([k, label]) => field(label, k, state.dates[k], { type: 'date' })).join('')}<button class="button primary" type="submit">일정 저장</button></form><ul class="deadline-list"><li><span>창립총회 공고 기준일</span><b>${datePlus(state.dates.foundingMeetingDate, -7)}</b></li><li><span>설립신고 법정 통지기간 참고</span><b>${datePlus(state.dates.filingDate, 20)}</b></li><li><span>납입 완료 후 설립등기 기한</span><b>${datePlus(state.dates.capitalPaidDate, 14)}</b></li></ul><p class="form-help">창립총회: 설립동의자 과반수 출석과 출석자 3분의 2 이상 찬성. 신고 보완·기간 연장 여부는 관할기관 안내에 따라 확인합니다.</p></section>
    <section class="card" data-panel="notices"><h2>공지 작성</h2><form id="noticeForm" class="form-grid">${field('제목', 'title', '', { full: true })}${field('내용', 'body', '', { full: true, area: true })}<label>공개 범위<select name="visibility"><option value="members">조합원 전용</option><option value="public">공개 홈페이지</option></select></label><label>게시 상태<select name="status"><option value="draft">초안</option><option value="published">게시</option></select></label><button class="button primary" type="submit">공지 저장</button></form>${records(state.notices, 'notices')}</section>
    <section class="card" data-panel="meetings"><h2>회의록·의결 기록</h2><form id="meetingForm" class="form-grid">${field('회의명', 'title', '')}${field('회의일', 'date', '', { type: 'date' })}${field('안건·논의·의결 내용', 'body', '', { full: true, area: true })}<label>조합원 공유<select name="status"><option value="draft">검토중</option><option value="published">조합원 공유</option></select></label><button class="button primary" type="submit">회의록 저장</button></form>${records(state.meetings, 'meetings')}</section>
    <section class="card" data-panel="supports"><h2>지원사업 준비</h2><form id="supportForm" class="form-grid">${field('사업명', 'title', '')}${field('주관기관', 'agency', '')}${field('신청 마감일', 'deadline', '', { type: 'date' })}<label>진행 상태<select name="status">${['관심', '검토중', '준비중', '신청', '선정', '종료'].map(v => `<option>${v}</option>`).join('')}</select></label>${field('자격·서류·담당·자부담 검토 메모', 'memo', '', { full: true, area: true })}<button class="button primary" type="submit">지원사업 저장</button></form>${records(state.supports, 'supports')}</section>
    <section class="card" data-panel="accounts"><h2>명부와 로그인 계정 연결</h2><p class="form-help">먼저 기존 EKODI 사용자·권한 관리에서 해당 이메일의 이 조합 접근권한을 등록하세요. 여기에서 이메일을 연결해도 계정 권한은 새로 생성되지 않습니다.</p><form id="accountsForm"><div class="table-wrap"><table class="table"><thead><tr><th>대표자</th><th>등록된 Google 계정 이메일</th><th>연결 상태</th></tr></thead><tbody>${state.founders.map(f => `<tr data-founder-id="${esc(f.id)}"><td>${esc(f.representative)}</td><td><input data-key="accountEmail" type="email" aria-label="${esc(f.representative)} 계정 이메일" value="${esc(f.accountEmail)}" placeholder="확인 후 연결"></td><td>${f.accountEmail ? '연결됨' : '확인 전'}</td></tr>`).join('')}</tbody></table></div><div class="form-actions"><button class="button primary" type="submit">명부 계정 연결 저장</button>${platform ? '<a class="button secondary" href="/admin/users/customers">사용자·권한 관리</a>' : ''}</div></form><h3>참여 의사 접수</h3>${project.applications?.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>대표자</th><th>사업자명</th><th>계정</th><th>참여 내용</th></tr></thead><tbody>${project.applications.map(a => `<tr><td>${esc(a.representative)}</td><td>${esc(a.business || '추후 등록')}</td><td>${esc(a.email)}</td><td>${esc(a.message)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">접수된 참여 의사가 없습니다.</p>'}</section>`;
    showTab(currentTab);
    restoreDrafts(drafts);
  }
  function showTab(tab) {
    currentTab = tab;
    document.querySelectorAll('[data-panel]').forEach(el => { el.hidden = el.dataset.panel !== tab; });
    document.querySelectorAll('[data-tab]').forEach(el => el.setAttribute('aria-selected', String(el.dataset.tab === tab)));
  }
  function renderMember() {
    const p = project.profile;
    const own = project.me.founder;
    $('#workspace').innerHTML = `<div class="stats"><div class="stat"><b>${project.founders.length}명</b><span>구성원 대표자</span></div><div class="stat"><b>${project.notices.length}건</b><span>게시된 공지</span></div><div class="stat"><b>${project.meetings.length}건</b><span>공유된 회의 기록</span></div><div class="stat"><b>${p.shareUnit.toLocaleString('ko-KR')}원</b><span>출자 1좌</span></div></div><div class="member-grid"><section class="card"><h2>나의 사업정보</h2><p class="muted">${esc(project.me.email)}</p>${own ? `<p><strong>${esc(own.representative)}</strong> · ${own.position === 'chair-designate' ? '조합장 예정' : '구성원 대표자'}</p><form id="myBusinessForm" class="form-grid">${field('사업자명 · 추후 등록 가능', 'business', own.business)}${field('업종', 'industry', own.industry)}<button class="button primary" type="submit">나의 사업정보 저장</button></form><p class="form-help">예정 출자: ${own.shares ? own.shares.toLocaleString('ko-KR') + '좌 · ' + won(own.shares * p.shareUnit) : '확인 전'} · 설립동의: ${own.consent === 'confirmed' ? '확인됨' : '확인 전'}</p>` : '<p class="notice-small">관리자가 로그인 계정과 대표자 명부를 연결하면 나의 사업정보를 입력할 수 있습니다.</p>'}</section><section class="card"><h2>우리 조합의 준비자료</h2><p>${esc(p.name)} · 조합장 예정 ${esc(p.chair)}</p><p class="muted">${esc(p.businesses)}</p><button class="button secondary" id="charter" type="button">정관 검토용 초안 받기</button>${project.authority.canAdmin ? `<a class="button primary" href="${base}/admin">운영관리</a>` : ''}</section></div><section class="card"><h2>함께하는 구성원</h2><div class="table-wrap"><table class="table"><thead><tr><th>대표자</th><th>사업자명</th><th>업종</th></tr></thead><tbody>${project.founders.map(f => `<tr><td>${esc(f.representative)}${f.position === 'chair-designate' ? '<small>조합장 예정</small>' : ''}</td><td>${esc(f.business || '추후 등록')}</td><td>${esc(f.industry || '확인 전')}</td></tr>`).join('')}</tbody></table></div></section><section class="card"><h2>조합 공지</h2>${records(project.notices, 'notices')}</section><section class="card"><h2>회의·의결 기록</h2>${records(project.meetings, 'meetings')}</section><section class="card"><h2>공동 지원사업 준비</h2>${records(project.supports, 'supports')}</section>`;
  }
  async function save(state, submittedForm = '') {
    if (saving) return;
    saving = true;
    const drafts = formDrafts(submittedForm);
    $('#workspace').querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = true; });
    setStatus('서버에 저장하고 있습니다.');
    try {
      const saved = await request('/project', { method: 'PUT', body: JSON.stringify({ revision: project.revision, state }) });
      project = { ...project, ...saved };
      dirtyForms.delete(submittedForm);
      for (const [kind, id] of Object.entries(recordForms)) if (id === submittedForm) editingRecords.delete(kind);
      renderAdmin(drafts);
      setStatus(`저장되었습니다. 수정본 ${project.revision} · 다른 기기에서도 같은 내용을 확인합니다.`);
    } catch (error) { if (!authenticationFailure(error)) setStatus(error.message, true); }
    finally { saving = false; $('#workspace').querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = false; }); }
  }
  async function load() {
    project = await request(hub ? '/overview' : surface === 'admin' ? '/project' : '/me');
    dirtyForms.clear(); editingRecords.clear();
    $('#gate').hidden = true; if ($('#application')) $('#application').hidden = true; $('#workspace').hidden = false;
    if (hub) {
      const rows = project.cooperatives;
      $('#workspace').innerHTML = `<div class="toolbar"><p>${rows.length}개 조합 · ${platform ? '명시적 플랫폼 관리' : '등록된 조합별 관리 권한'}</p><div class="actions"><button class="quiet" id="reload" type="button">새로 불러오기</button><button class="quiet" id="print" type="button">인쇄</button></div></div><div class="member-grid">${rows.map(c => `<article class="card" data-managed-cooperative="${esc(c.slug)}"><span class="badge">설립 준비</span><h2>${esc(c.name)}</h2><p>조합장 예정 · ${esc(c.chair)}</p><p class="form-help">구성원 ${c.representatives}명 · 사업자명 ${c.businessesRegistered}/${c.representatives} · 서류 검토 ${c.documentsReviewed}/${c.documentsTotal}</p><p class="form-help">${c.updatedAt ? '최근 저장 ' + esc(new Date(c.updatedAt).toLocaleString('ko-KR')) : '저장공간 준비 완료'}</p><div class="actions"><a class="button primary" href="${esc(c.adminPath)}">운영관리 열기</a><a class="button secondary" href="/${esc(c.publicSlug || c.slug)}/">홈페이지</a><a class="button secondary" href="/${esc(c.publicSlug || c.slug)}/members">조합원 공간</a></div></article>`).join('')}</div>`;
      setStatus('관리 권한 확인 · 각 조합의 서버 자료를 불러왔습니다.');
      return;
    }
    if (surface === 'admin') renderAdmin(); else renderMember();
    setStatus(`접근 확인 · ${surface === 'admin' ? '관리자' : '조합원'} · 이 조합의 서버 데이터를 불러왔습니다.`);
    document.querySelectorAll('[data-coop-name]').forEach(el => { el.textContent = project.state?.profile?.name || project.profile.name; });
    window.dispatchEvent(new Event('ekodi-cooperative-session-ready'));
  }
  function bind() {
    for (const name of ['input', 'change']) $('#workspace').addEventListener(name, event => {
      const form = event.target.closest('form'); if (form?.id) dirtyForms.add(form.id);
    });
    window.addEventListener('beforeunload', event => { if (dirtyForms.size) { event.preventDefault(); event.returnValue = ''; } });
    $('#workspace').addEventListener('click', async event => {
      const target = event.target.closest('button');
      if (!target || saving) return;
      try {
        if (target.dataset.tab) return showTab(target.dataset.tab);
        if (target.id === 'reload') { if (!dirtyForms.size || confirm('저장되지 않은 입력을 버리고 다시 불러올까요?')) return await load(); return; }
        if (target.id === 'print') return window.print();
        if (target.id === 'charter') return await download('/charter', slug + '-charter-draft.txt');
        if (target.id === 'export') return await download('/export', slug + '-formation.json');
        if (target.dataset.edit) {
          const kind = target.dataset.edit;
          const row = project.state[kind].find(r => r.id === target.dataset.record);
          const form = document.getElementById(recordForms[kind]);
          for (const [key, value] of Object.entries(row)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value || '';
          editingRecords.set(kind, row.id); dirtyForms.add(form.id);
          form.querySelector('button[type="submit"]').textContent = '수정 저장';
          form.scrollIntoView({ block: 'center', behavior: 'auto' }); return;
        }
        if (target.dataset.remove && confirm('이 기록을 삭제하시겠습니까?')) {
          const kind = target.dataset.remove;
          await save({ [kind]: project.state[kind].filter(row => row.id !== target.dataset.record) });
        }
      } catch (error) { if (!authenticationFailure(error)) setStatus(error.message, true); }
    });
    $('#workspace').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target;
      const values = Object.fromEntries(new FormData(form));
      try {
        if (form.id === 'myBusinessForm') {
          project = await request('/my-business', { method: 'PUT', body: JSON.stringify({ ...values, revision: project.revision }) });
          dirtyForms.delete(form.id); renderMember(); setStatus('나의 사업정보가 저장되었습니다.'); return;
        }
        if (form.id === 'profileForm') return await save({ profile: { ...values, shareUnit: Number(values.shareUnit), firstYearBudget: values.firstYearBudget === '' ? null : Number(values.firstYearBudget), officeConfirmed: form.elements.officeConfirmed.checked } }, form.id);
        if (form.id === 'foundersForm' || form.id === 'accountsForm') {
          const founders = project.state.founders.map(f => ({ ...f }));
          form.querySelectorAll('[data-founder-id]').forEach(row => {
            const founder = founders.find(f => f.id === row.dataset.founderId);
            row.querySelectorAll('[data-key]').forEach(input => { founder[input.dataset.key] = input.dataset.key === 'shares' ? (input.value === '' ? null : Number(input.value)) : input.value; });
          });
          return await save({ founders }, form.id);
        }
        if (form.id === 'documentsForm') return await save({ documents: Object.fromEntries(documents.map(([id]) => [id, { status: values[id], note: values[id + '-note'] }])) }, form.id);
        if (form.id === 'datesForm') return await save({ dates: values }, form.id);
        const kind = { noticeForm: 'notices', meetingForm: 'meetings', supportForm: 'supports' }[form.id];
        if (kind) {
          const editingId = editingRecords.get(kind);
          const row = { id: editingId || crypto.randomUUID(), ...values };
          return await save({ [kind]: editingId ? project.state[kind].map(r => r.id === editingId ? row : r) : [...project.state[kind], row] }, form.id);
        }
      } catch (error) { if (!authenticationFailure(error)) setStatus(error.message, true); }
    });
    $('#applicationForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target;
      const button = form.querySelector('button'); button.disabled = true;
      try { await request('/application', { method: 'POST', body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), consent: form.elements.consent.checked }) }); $('#applicationResult').textContent = '참여 의사가 접수되었습니다. 관리자가 확인한 뒤 안내합니다.'; }
      catch (error) { $('#applicationResult').textContent = error.message; }
      finally { button.disabled = false; }
    });
    $('#logout').addEventListener('click', () => { if (dirtyForms.size && !confirm('저장되지 않은 입력을 버리고 로그아웃할까요?')) return; dirtyForms.clear(); sessionStorage.removeItem(SESSION_KEY); if (platform) sessionStorage.removeItem('ekodi-auth-token'); location.replace(base + '/'); });
  }
  async function main() {
    if (surface === 'public') {
      try {
        const data = await request('/public');
        for (const [selector, key] of [['#publicPurpose', 'purpose'], ['#publicIndustries', 'industries'], ['#publicName', 'name'], ['#publicChair', 'chair'], ['#publicBusinesses', 'businesses']]) $(selector).textContent = data[key];
        $('#publicShare').textContent = won(data.shareUnit);
        document.querySelectorAll('[data-coop-name]').forEach(el => { el.textContent = data.name; });
        document.title = data.name + ' | 함께하는 유통';
        if (data.notices.length) $('#publicNotices').innerHTML = data.notices.map(n => `<article><span class="badge">조합 공지</span><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p></article>`).join('');
      } catch { /* The public formation description remains available; no private data fallback. */ }
      return;
    }
    $('#loginLink').href = platform ? '/auth/?site=admin&direct=1&return_to=' + encodeURIComponent('https://ekodi.kr' + location.pathname) : loginUrl();
    bind();
    try {
      token = await accessToken();
      if (!token) { $('#gate').hidden = false; setStatus('로그인 후 이 조합의 권한을 확인합니다.'); return; }
      $('#logout').hidden = false;
      await load();
    } catch (error) {
      $('#workspace').hidden = true; $('#gate').hidden = false;
      if (error.status === 401) { sessionStorage.removeItem(SESSION_KEY); setStatus('로그인이 만료되었습니다. 다시 로그인해 주세요.'); }
      else if (error.status === 403) {
        $('#gateTitle').textContent = hub ? '협동조합 관리 권한을 확인해 주세요' : surface === 'admin' ? '이 조합의 관리자 권한을 확인해 주세요' : '조합원 등록 확인이 필요합니다';
        $('#gateMessage').textContent = '로그인 계정과 이 조합의 접근권한은 별도로 확인합니다. 이름만으로 권한이 부여되지는 않습니다.';
        $('#loginLink').hidden = true;
        if (!platform && surface === 'members') $('#application').hidden = false;
        setStatus('이 계정에 등록된 조합별 권한이 없습니다.');
      } else setStatus(errors[error.code] || error.message || '접근을 확인하지 못했습니다. 다시 시도해 주세요.', true);
    }
  }
  main();
}

export function cooperativeScript() {
  // Wrangler preserves function names with a lexical __name helper. Serialized
  // client functions need the same helper inside their browser-only scope.
  return `(()=>{const __name=(target,value)=>Object.defineProperty(target,'name',{value,configurable:true});\n(${clientMain.toString()})(${JSON.stringify(COOP_DOCUMENTS)});})();`;
}
