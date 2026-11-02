import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../ai-operations-center-admin.js', import.meta.url), 'utf8');

test('AI operations center keeps the existing provider runtime and supports curated tool tabs', async () => {
  new vm.Script(code);
  let domReady;
  let clickHandler;
  let mountedRoot;
  const body = { innerHTML: '' };
  const panel = {
    querySelector() { return null; },
    prepend(node) { mountedRoot = node; },
  };
  const document = {
    readyState: 'loading',
    head: { appendChild() {} },
    documentElement: {},
    addEventListener(event, callback) { if (event === 'DOMContentLoaded') domReady = callback; },
    querySelector(selector) {
      if (selector === '#aiOpsPanel') return panel;
      if (selector === '#aiOperationsCenter') return mountedRoot;
      return null;
    },
    createElement(tag) {
      if (tag === 'style') return { textContent: '', id: '' };
      return {
        id: '',
        innerHTML: '',
        querySelector(selector) { return selector === '.aic-body' ? body : null; },
        querySelectorAll() { return []; },
        addEventListener(event, callback) { if (event === 'click') clickHandler = callback; },
      };
    },
  };
  const window = { setTimeout() {} };
  const response = data => ({ ok: true, json: async () => data });
  const fetch = async url => {
    if (url.includes('/providers/admin')) return response({
      providers: [{ id: 'openai', name: 'OpenAI', configured: true, health: 'healthy', enabled: true }],
      routes: [],
    });
    if (url.includes('/actions')) return response({ actions: [] });
    return response({ agents: [], actionTiers: [] });
  };
  class MutationObserver {
    observe() {}
    disconnect() {}
  }
  vm.runInNewContext(code, { document, window, fetch, MutationObserver, sessionStorage: { getItem() { return ''; } }, location: { hash: '' } });
  assert.equal(typeof domReady, 'function');
  domReady();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof clickHandler, 'function');
  async function select(tab) {
    await clickHandler({ target: { closest(selector) {
      return selector === '[data-aic-tab]' ? { dataset: { aicTab: tab } } : null;
    } } });
  }
  await select('tools');
  assert.match(body.innerHTML, /공통 AI 도구 등록표/);
  assert.match(body.innerHTML, /ChatGPT \/ OpenAI/);
  assert.match(body.innerHTML, /연결 상태 정상/);
  assert.match(body.innerHTML, /별도 연동 심사 필요/);
  assert.match(body.innerHTML, /rel="noopener noreferrer"/);
  assert.doesNotMatch(body.innerHTML, /API 연결 완료/);
  await select('workflows');
  assert.match(body.innerHTML, /AI 상품 홍보/);
  assert.match(body.innerHTML, /href="\/ekodibiz\/marketing-ai"/);
  assert.match(body.innerHTML, /통합 자동실행은 검증 전 대기/);
  await select('site-settings');
  assert.match(body.innerHTML, /href="\/cgma\/admin\/services"/);
  assert.match(body.innerHTML, /메뉴 표시 여부는 API 사용권/);
  assert.doesNotMatch(body.innerHTML, /권한을 자동 부여/);
  await select('providers');
  assert.match(body.innerHTML, /AI 공급자·모델/);
  assert.match(body.innerHTML, /data-provider-id="openai"/);
});

test('tool directory remains discovery-only; runtime secrets and side effects remain in existing guarded APIs', () => {
  assert.match(code, /data-aic-tool-tab="providers"/);
  assert.match(code, /\/api\/ai-modules\/v1\/providers\/admin/);
  assert.match(code, /x-ekodi-confirm-impact/);
  assert.match(code, /외부 참고 · API 미검증/);
  assert.match(code, /사이트 독립 설정/);
  assert.doesNotMatch(code, /localStorage\.setItem\(['"]ai-tool/);
});