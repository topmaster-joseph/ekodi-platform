// Re-issued from PR #7891, which sat open and undeployed for 7 days: EKODI's
// release-provenance recovery could not create a release branch at its source
// commit (HTTP 403 "Resource not accessible by integration" — the source was cut
// from an older main whose .github/workflows have since changed, and the recovery
// token has no `workflows` permission). The recovery diagnosed it correctly and
// commented the remedy ("re-issue the same change on current main") on the PR,
// and nothing executed that remedy. Measured 2026-11-10 in
// ekodi_orchestrator_tasks.dead_letter_reason: 46 recoveries refused this way
// since 2026-10-27.
//
// The change itself carries no test. These tests pin its three load-bearing
// claims so the re-issue is verifiable rather than merely re-applied:
//   1. the studio's login URL uses the canonical `publishing` site key, which
//      test/publishing-admin-page.test.mjs and
//      test/publishing-human-auth-controls-20261104.test.mjs already require of
//      every other publishing surface (the studio used `books`);
//   2. a 401 distinguishes "no central EKODI session" from "central session
//      exists but the studio handoff failed" — the shared site header is not an
//      authorization grant for this studio, and one message for both states sent
//      signed-in people to a login page that could not help them;
//   3. the notice is built from DOM nodes, never by interpolating location.href
//      into innerHTML.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

const SOURCE = readFileSync(new URL('../books/publishing/studio/app.js', import.meta.url), 'utf8');
const PAGE = 'https://ekodi.kr/books/publishing/studio/?tab=titles';

function element() {
  return {
    hidden: false, href: '', type: '', className: '', textContent: '', innerHTML: '',
    children: [], listeners: {},
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children.length = 0; this.children.push(...nodes); },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    reset() {},
  };
}

// `me` drives the studio API; `session` drives the central-session probe the 401
// path makes. Both are observed so a test can assert the probe really happened.
function fixture({ me, session }) {
  const nodes = new Map();
  const classes = new Set();
  const calls = [];
  const document = {
    documentElement: { classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } },
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
    createElement() { return element(); },
    createTextNode(text) { return { text }; },
  };
  async function fetch(url, options = {}) {
    const href = String(url);
    calls.push({ url: href, options });
    if (href.endsWith('/api/session')) return {
      ok: session.status === 200, status: session.status,
      async json() { return session.body; },
    };
    return {
      ok: me.status === 200, status: me.status,
      async json() { return me.body; },
    };
  }
  const context = {
    document, fetch, location: { href: PAGE }, console,
    FormData: class { constructor() {} [Symbol.iterator]() { return [][Symbol.iterator](); } },
    alert() {},
    encodeURIComponent,
  };
  runInNewContext(SOURCE, context);
  return { node: selector => document.querySelector(selector), classes, calls };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

const UNAUTHORIZED = { status: 401, body: { error: 'unauthorized' } };
const SIGNED_IN = { status: 200, body: { account: { email: 'joseph@ekodi.kr' }, stores: [], books: [] } };

test('a guest with no central session is offered the canonical publishing login', async () => {
  const { node, calls } = fixture({ me: UNAUTHORIZED, session: { status: 401, body: {} } });
  await settle();
  const state = node('#sessionState');
  const [message, link] = state.children;
  assert.match(message.textContent, /로그인이 필요합니다/);
  assert.equal(link.textContent, '통합 로그인');
  const url = new URL(link.href);
  assert.equal(url.origin + url.pathname, 'https://ekodi.kr/auth/');
  assert.equal(url.searchParams.get('site'), 'publishing', 'the studio must use the canonical publishing site key');
  assert.equal(url.searchParams.get('return_to'), PAGE, 'login must return to the exact page, query string included');
  assert.ok(calls.some(call => call.url.endsWith('/api/session')), 'the central session must actually be probed');
});

test('a signed-in person whose studio handoff failed is told that, not to log in again', async () => {
  // The failure this distinguishes: the shared header shows them signed in, the
  // studio returns 401, and a plain "please log in" sends them in a circle.
  const { node } = fixture({ me: UNAUTHORIZED, session: { status: 200, body: { authenticated: true } } });
  await settle();
  const [message, link] = node('#sessionState').children;
  assert.match(message.textContent, /에코디 로그인은 확인되지만/);
  assert.doesNotMatch(message.textContent, /로그인이 필요합니다/);
  assert.equal(link.textContent, '계정 연결 다시 확인');
  assert.equal(new URL(link.href).searchParams.get('site'), 'publishing');
});

test('an unreachable session probe degrades to the guest message instead of throwing', async () => {
  // This runs on every 401, so a failing probe may not break the page.
  const { node } = fixture({ me: UNAUTHORIZED, session: { status: 503, body: {} } });
  await settle();
  const [message] = node('#sessionState').children;
  assert.match(message.textContent, /로그인이 필요합니다/);
});

test('the notice offers a re-check control that retries without a page reload', async () => {
  const { node, calls } = fixture({ me: UNAUTHORIZED, session: { status: 401, body: {} } });
  await settle();
  const retry = node('#sessionState').children.find(child => child?.type === 'button');
  assert.ok(retry, 'a retry control must exist');
  assert.equal(retry.textContent, '다시 확인');
  const before = calls.length;
  await retry.listeners.click();
  await settle();
  assert.ok(calls.length > before, 'the control must re-run the session load');
});

test('the compact signed-in layout is applied only while actually signed in', async () => {
  const guest = fixture({ me: UNAUTHORIZED, session: { status: 401, body: {} } });
  await settle();
  assert.equal(guest.classes.has('publishing-signed-in'), false);
  assert.equal(guest.node('#workspace').hidden, true, 'the workspace stays hidden for a guest');

  const member = fixture({ me: SIGNED_IN, session: { status: 200, body: { authenticated: true } } });
  await settle();
  assert.equal(member.classes.has('publishing-signed-in'), true);
  assert.equal(member.node('#workspace').hidden, false);
  assert.match(member.node('#sessionState').textContent, /joseph@ekodi\.kr/);
});

test('the signed-out notice is never built by interpolating the URL into innerHTML', async () => {
  // The previous version wrote location.href into state.innerHTML. Keep the
  // notice on DOM construction so the page URL can never become markup.
  assert.doesNotMatch(SOURCE, /state\.innerHTML/, 'the session notice must not be assigned as HTML');
  assert.match(SOURCE, /state\.replaceChildren\(\)/);
  assert.match(SOURCE, /document\.createElement\('a'\)/);
  // And the old non-canonical site key must not come back.
  assert.doesNotMatch(SOURCE, /site=books/, 'the studio login must not revert to the books site key');
  assert.match(SOURCE, /site=publishing/);
});
