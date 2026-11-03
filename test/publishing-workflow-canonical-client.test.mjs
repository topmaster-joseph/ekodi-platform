import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { routeCanonicalSurface } from '../canonical-surface-router.js';

const origin = 'https://ekodi.kr';
const base = `${origin}/publishing/api/workflow`;
const id = '11111111-1111-4111-8111-111111111111';
const fixture = { id, title: 'Local test manuscript', fieldId: 'humanities',
  stage: 'planning', editionId: `${id}:v1`, revision: 1 };

function element() {
  return { children: [], listeners: new Map(), value: '', textContent: '',
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { this.listeners.set(type, fn); },
    insertRow() { const row = element(); this.children.push(row); return row; },
    insertCell() { const cell = element(); this.children.push(cell); return cell; },
    reset() {}, scrollIntoView() {} };
}

async function client({ signedIn = true, healthStatus = 200 } = {}) {
  const script = readFileSync(new URL('../publishing/human/manage/app.js', import.meta.url), 'utf8');
  const response = await routeCanonicalSurface(new Request(
    `${origin}/publishing/human/manage/app.js`), {
    PUBLISHING: { fetch: async () => new Response(script, {
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    }) },
  });
  assert.equal(response.status, 200);
  const nodes = new Map();
  const node = key => { if (!nodes.has(key)) nodes.set(key, element()); return nodes.get(key); };
  const requests = [];
  const context = vm.createContext({
    document: { getElementById: node, createElement: element, createTextNode: text => text },
    localStorage: { getItem: () => signedIn ? JSON.stringify({ access_token: 'local-fixture-only-never-sent-to-production' }) : null },
    location: { href: `${origin}/publishing/human/manage/` }, URL, AbortController,
    setTimeout, clearTimeout, prompt: () => 'a'.repeat(64), confirm: () => false,
    FormData: class { constructor(form) { this.values = form.formEntries || []; }
      [Symbol.iterator]() { return this.values[Symbol.iterator](); }
      get(key) { return this.values.find(([k]) => k === key)?.[1] ?? null; } },
    fetch: async (url, options = {}) => {
      requests.push({ url: String(url), method: options.method || 'GET', body: options.body });
      const health = String(url).endsWith('/health');
      const status = health ? healthStatus : 200;
      return { ok: status < 400, status, json: async () => health ?
        { ok: status < 400, dbConfigured: status < 400 } :
        { ok: true, role: 'author', projects: [fixture], jobs: [], blocker: 'LOCAL_FIXTURE' } };
    },
  });
  vm.runInContext(await response.text(), context);
  const controls = vm.runInContext('({ load, transition, loadJobs, renderDetail, setActive: value => { active = value; } })', context);
  await new Promise(resolve => setImmediate(resolve));
  return { requests, node, controls };
}

test('the apex-served workflow client reaches the real health and project list URLs', async () => {
  const { requests } = await client();
  assert.deepEqual(requests.slice(0, 2).map(x => x.url), [`${base}/health`, `${base}/projects`]);
});

test('guests see login guidance after the real health check and send no private project request', async () => {
  const { requests, node } = await client({ signedIn: false });
  assert.deepEqual(requests.map(x => x.url), [`${base}/health`]);
  assert.match(node('connection').textContent, /로그인이 필요합니다/);
  assert.doesNotMatch(node('connection').textContent, /원장이 아직 연결되지/);
});

test('apex rewriting preserves create, transition, readiness, AI and evidence endpoints', async () => {
  const { requests, node, controls } = await client();
  node('createForm').formEntries = [['title', 'Local test manuscript'], ['fieldId', 'humanities']];
  await node('createForm').listeners.get('submit')({ preventDefault() {}, currentTarget: node('createForm') });
  controls.setActive(fixture);
  await controls.transition('revise', { manuscriptDigest: 'b'.repeat(64), changedMetadata: true });
  await controls.loadJobs();
  controls.renderDetail();
  await node('actions').children.find(x => x.textContent === '판매 준비조건 확인').listeners.get('click')();
  controls.setActive(fixture);
  node('aiForm').formEntries = [['kind', 'outline'], ['consent', 'on']];
  await node('aiForm').listeners.get('submit')({ preventDefault() {}, currentTarget: node('aiForm') });
  node('releaseEvidence').value = '{}';
  await node('saveEvidence').listeners.get('click')();
  for (const request of requests) {
    assert.ok(request.url.startsWith(`${base}/`), request.url);
    assert.ok(!request.url.slice(base.length).includes('/publishing/'), request.url);
  }
  for (const [method, path] of [
    ['POST', '/projects'], ['POST', `/projects/${id}/transition`],
    ['GET', `/projects/${id}/readiness`], ['GET', `/projects/${id}/ai`],
    ['POST', `/projects/${id}/ai`], ['POST', `/projects/${id}/evidence`],
  ]) assert.ok(requests.some(x => x.method === method && x.url === base + path), `${method} ${path}`);
  const revision = requests.find(x => x.url === `${base}/projects/${id}/transition`);
  assert.equal(JSON.parse(revision.body).revision, 1);
});

test('jubilee registration button only posts through canonical authorized workflow', async()=>{
  const signed=await client();
  assert.equal(signed.node('jubileeRegister').disabled,false);
  await signed.node('jubileeRegister').listeners.get('click')();
  assert.ok(signed.requests.some(x=>x.url===base+'/jubilee/register'&&x.method==='POST'));
  assert.match(signed.node('jubileeStatus').textContent,/원고 파일 입고/);
  const guest=await client({signedIn:false});
  assert.equal(guest.node('jubileeRegister').disabled,true);
  await guest.node('jubileeRegister').listeners.get('click')();
  assert.ok(!guest.requests.some(x=>x.method==='POST'));
});