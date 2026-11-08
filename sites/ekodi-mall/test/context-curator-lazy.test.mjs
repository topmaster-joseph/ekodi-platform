import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/context-curator.js', import.meta.url), 'utf8');

function page({ hash = '', observerSupported = true, holdResponse = false } = {}) {
  const formHandlers = new Map();
  const windowHandlers = new Map();
  const form = { addEventListener: (name, handler) => formHandlers.set(name, handler) };
  const input = { value: '' };
  const results = { children: [], replaceChildren(...nodes) { this.children = nodes; }, append(...nodes) { this.children.push(...nodes); } };
  const summary = { textContent: '' };
  const disclosure = { textContent: '' };
  const section = {};
  const nodes = new Map([
    ['#contextForm', form], ['#contextInput', input], ['#contextResults', results],
    ['#contextSummary', summary], ['#contextDisclosure', disclosure], ['#recommend', section]
  ]);
  const document = {
    querySelector: (selector) => nodes.get(selector) || null,
    querySelectorAll: () => [],
    createElement: (tag) => ({
      tagName: tag, className: '', textContent: '', append() {}, setAttribute() {}
    }),
    addEventListener() {},
    dispatchEvent() {}
  };
  const window = {
    location: { hash },
    addEventListener: (name, handler) => windowHandlers.set(name, handler)
  };
  let observer = null;
  class FakeObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; observer = this; }
    observe(node) { this.target = node; }
    disconnect() { this.disconnected = true; }
    trigger(isIntersecting) { this.callback([{ isIntersecting }]); }
  }
  let requests = 0;
  let release = null;
  const fetch = () => {
    requests += 1;
    if (holdResponse) return new Promise((resolve) => {
      release = () => resolve({ ok: true, json: async () => ({ products: [] }) });
    });
    return Promise.resolve({ ok: true, json: async () => ({ products: [] }) });
  };
  vm.runInNewContext(source, {
    document, window, fetch,
    IntersectionObserver: observerSupported ? FakeObserver : undefined,
    URL, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    matchMedia: () => ({ matches: true })
  }, { timeout: 1000 });
  return {
    window, formHandlers, windowHandlers, summary,
    get observer() { return observer; },
    get requests() { return requests; },
    release: () => release?.()
  };
}

const settled = () => new Promise((resolve) => setImmediate(resolve));

test('off-screen recommendations do not request affiliate products on initial Mall visit', async () => {
  const view = page();
  assert.equal(view.requests, 0);
  assert.ok(view.observer);
  assert.equal(view.observer.options.rootMargin, '320px 0px');
  view.observer.trigger(false);
  assert.equal(view.requests, 0);
  view.observer.trigger(true);
  assert.equal(view.requests, 1);
  await settled();
  view.observer.trigger(true);
  assert.equal(view.requests, 1, 'the preview must fetch at most once');
});

test('recommendation hash and no-IntersectionObserver browsers preserve eager fallback', () => {
  const deepLink = page({ hash: '#recommend' });
  assert.equal(deepLink.requests, 1);
  const fallback = page({ observerSupported: false });
  assert.equal(fallback.requests, 1);
});

test('focus and user recommendation share one request; later preview cannot override user result', async () => {
  const view = page();
  view.formHandlers.get('focusin')();
  assert.equal(view.requests, 1);
  await view.window.EkodiContextCurator.recommend('감사 선물', false);
  assert.match(view.summary.textContent, /기준으로/);
  view.observer.trigger(true);
  await settled();
  assert.equal(view.requests, 1);
  assert.match(view.summary.textContent, /기준으로/);
});

test('late default result does not overwrite a recommendation started while a request is pending', async () => {
  const view = page({ holdResponse: true });
  view.observer.trigger(true);
  assert.equal(view.requests, 1);
  const userRecommendation = view.window.EkodiContextCurator.recommend('집들이 선물', false);
  view.release();
  await userRecommendation;
  await settled();
  assert.equal(view.requests, 1);
  assert.match(view.summary.textContent, /기준으로/);
});
