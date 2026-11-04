import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../publishing/human/manage/app.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../publishing/human/manage/index.html', import.meta.url), 'utf8');
const CENTRAL = 'sb-renzehysxirjilvdxacv-auth-token';
const BOOKS = 'ekodi-books-buyer-session';
const PAGE = 'https://ekodi.kr/publishing/human/manage/';

function element() {
  return {
    hidden: false, disabled: false, href: '', textContent: '', children: [], listeners: {},
    append(...children) { this.children.push(...children); },
    replaceChildren() { this.children.length = 0; },
    insertRow() { const row = element(); this.children.push(row); return row; },
    insertCell() { const cell = element(); this.children.push(cell); return cell; },
    querySelectorAll() { return []; },
    addEventListener(type, cb) { this.listeners[type] = cb; },
    scrollIntoView() {},
  };
}
function fixture({ token = null, responseStatus = 200, role = 'admin', revokeSuccess = true } = {}) {
  const nodes = new Map();
  const el = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  el('authLogin').hidden = true;
  el('authLogout').hidden = true;
  const entries = new Map();
  if (token) entries.set(CENTRAL, JSON.stringify({ currentSession: { access_token: token } }));
  const localStorage = {
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, String(value)); },
    removeItem(key) { entries.delete(key); },
  };
  const calls = [];
  const listeners = {};
  async function fetch(url, opts = {}) {
    calls.push({ url: String(url), opts });
    if (String(url).endsWith('/health')) return { ok: true, status: 200, async json() { return { dbConfigured: true }; } };
    if (String(url).endsWith('/projects')) return {
      ok: responseStatus === 200, status: responseStatus,
      async json() { return responseStatus === 200 ? { projects: [], role } : { code: 'HTTP_' + responseStatus }; },
    };
    if (String(url).includes('/auth/v1/logout')) return { ok: revokeSuccess, status: revokeSuccess ? 204 : 503 };
    throw new Error('unexpected fetch: ' + url);
  }
  const context = {
    URL, localStorage, fetch, AbortController, setTimeout, clearTimeout,
    location: { href: PAGE },
    document: {
      getElementById: el,
      createElement: () => element(),
      createTextNode: text => ({ textContent: text }),
    },
    window: { addEventListener(type, cb) { listeners[type] = cb; } },
    prompt() { throw Error('unexpected dialog'); },
    confirm() { throw Error('unexpected dialog'); },
    FormData,
    console,
  };
  runInNewContext(source, context, { filename: 'publishing/human/manage/app.js' });
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
  return { el, calls, listeners, entries, settle, localStorage };
}

test('responsive toolbar has independent login and logout controls', () => {
  assert.match(markup, /id="authLogin"[^>]*hidden/);
  assert.match(markup, /id="authLogout"[^>]*hidden/);
  assert.match(markup, /\.toolbar-actions\{display:flex;[^}]*flex-wrap:wrap/);
  assert.match(markup, /\[hidden\]\{display:none!important\}/);
});

test('authenticated project API shows only logout, including admin with zero projects', async () => {
  const ui = fixture({ token: 'valid-session' }); await ui.settle();
  assert.equal(ui.el('authLogin').hidden, true);
  assert.equal(ui.el('authLogout').hidden, false);
  assert.match(ui.el('connection').textContent, /권한: admin/);
  const projectCall = ui.calls.find(x => x.url.endsWith('/projects'));
  assert.equal(projectCall.opts.headers.authorization, 'Bearer valid-session');
});

test('guest or rejected token offers login to exact starting page', async () => {
  for (const opts of [{}, { token: 'expired-session', responseStatus: 401 }]) {
    const ui = fixture(opts); await ui.settle();
    assert.equal(ui.el('authLogin').hidden, false);
    assert.equal(ui.el('authLogout').hidden, true);
    assert.equal(ui.el('jubileeRegister').disabled, true);
    const url = new URL(ui.el('authLogin').href);
    assert.equal(url.origin + url.pathname, 'https://ekodi.kr/auth/');
    assert.equal(url.searchParams.get('site'), 'publishing');
    assert.equal(url.searchParams.get('return_to'), PAGE);
  }
});

test('server-denied publishing permissions retain account switch via logout', async () => {
  const ui = fixture({ token: 'valid-but-forbidden', responseStatus: 403 }); await ui.settle();
  assert.equal(ui.el('authLogin').hidden, true);
  assert.equal(ui.el('authLogout').hidden, false);
  assert.equal(ui.el('jubileeRegister').disabled, true);
  assert.match(ui.el('connection').textContent, /출판 관리 권한이 없습니다/);
});

test('logout revokes existing browser token, clears client session and returns to guest state', async () => {
  const ui = fixture({ token: 'valid-session' }); await ui.settle();
  ui.localStorage.setItem(BOOKS, JSON.stringify({ accessToken: 'other-session' }));
  await ui.el('authLogout').listeners.click(); await ui.settle();
  assert.equal(ui.localStorage.getItem(CENTRAL), null);
  assert.equal(ui.localStorage.getItem(BOOKS), null);
  assert.equal(ui.el('authLogin').hidden, false);
  assert.equal(ui.el('authLogout').hidden, true);
  assert.equal(ui.el('jubileeRegister').disabled, true);
  const requests = ui.calls.filter(x => x.url.includes('/auth/v1/logout'));
  assert.equal(requests.length, 2);
  assert.ok(requests.every(x => x.opts.method === 'POST'));
});

test('cross-tab sign-out rechecks and clears previous project authorization', async () => {
  const ui = fixture({ token: 'valid-session' }); await ui.settle();
  ui.localStorage.removeItem(CENTRAL);
  ui.listeners.storage({ key: CENTRAL }); await ui.settle();
  assert.equal(ui.el('authLogin').hidden, false);
  assert.equal(ui.el('authLogout').hidden, true);
  assert.equal(ui.el('jubileeRegister').disabled, true);
});

test('failed remote revocation never preserves local browser login', async () => {
  const ui = fixture({ token: 'valid-session', revokeSuccess: false }); await ui.settle();
  await ui.el('authLogout').listeners.click(); await ui.settle();
  assert.equal(ui.localStorage.getItem(CENTRAL), null);
  assert.equal(ui.el('authLogin').hidden, false);
  assert.ok(ui.el('connection').children.some(x => /서버 세션 종료 응답은 확인되지/.test(x.textContent)));
});
