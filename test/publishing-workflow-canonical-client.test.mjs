import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
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
    crypto: webcrypto,
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
  const controls = vm.runInContext('({ load, transition, loadJobs, renderDetail, errorText, setActive: value => { active = value; } })', context);
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
test('jubilee registration error messages distinguish missing owner, wrong owner and stale lookup',async()=>{
  const {controls}=await client();
  assert.match(controls.errorText({message:'JUBILEE_OWNER_NOT_CONFIGURED',status:503}),/저자 계정이 출판 서버에 연결되지/);
  assert.match(controls.errorText({message:'JUBILEE_OWNER_ONLY',status:403}),/지정 저자 계정이 아닙니다/);
  assert.match(controls.errorText({message:'JUBILEE_DRAFT_LOOKUP_FAILED',status:500}),/재조회에 실패/);
  assert.match(controls.errorText({status:401,message:'LOGIN_REQUIRED'}),/로그인이 필요/);
});

test('hashes an actual selected manuscript file locally and records its digest without uploading bytes',async()=>{
  const {requests,node,controls}=await client();
  controls.setActive(fixture);controls.renderDetail();
  const contents=Buffer.from('Verified Jubilee manuscript draft bytes / 2026-11-05');
  const expected=createHash('sha256').update(contents).digest('hex');
  const chosen={name:'jubilee-volume1.docx',size:contents.byteLength,
    arrayBuffer:async()=>Uint8Array.from(contents).buffer};
  node('manuscriptFile').files=[chosen];
  await node('manuscriptFile').listeners.get('change')();
  assert.equal(node('manuscriptDigest').value,expected);
  assert.match(node('digestStatus').textContent,/파일 자체는 업로드되지 않았습니다/);
  const change=node('actions').children.find(x=>x.textContent==='원고 새 판본 기록');
  await change.listeners.get('click')();
  const requestsToRevise=requests.filter(x=>x.url===base+'/projects/'+id+'/transition'&&x.method==='POST');
  assert.equal(requestsToRevise.length,1);
  const submitted=JSON.parse(requestsToRevise[0].body);
  assert.equal(submitted.manuscriptDigest,expected);
  assert.equal(submitted.action,'revise');
  assert.ok(!requests.some(x=>String(x.body||'').includes(contents.toString())));
});

test('rejects a version-record click without a chosen actual file; never prompts for a made-up hash',async()=>{
  const {requests,node,controls}=await client();
  controls.setActive(fixture);controls.renderDetail();
  await node('actions').children.find(x=>x.textContent==='원고 새 판본 기록').listeners.get('click')();
  assert.match(node('result').textContent,/먼저 위의 원고 파일을 선택/);
  assert.ok(!requests.some(x=>x.url.endsWith('/transition')));
});

test('discards a stale SHA-256 calculation if the selected project changes',async()=>{
  const {node,controls}=await client();
  controls.setActive(fixture);controls.renderDetail();
  let finish;
  const buffer=new Uint8Array([1,2,3]).buffer;
  const chosen={name:'stale.docx',size:3,arrayBuffer:()=>new Promise(resolve=>{finish=()=>resolve(buffer)})};
  node('manuscriptFile').files=[chosen];
  const calculation=node('manuscriptFile').listeners.get('change')();
  controls.setActive({...fixture,id:'22222222-2222-4222-8222-222222222222'});
  controls.renderDetail();
  finish();
  await calculation;
  assert.equal(node('manuscriptDigest').value,'');
  assert.equal(node('digestStatus').textContent,'');
});

test('oversized files are rejected safely without recording a digest',async()=>{
  const {requests,node,controls}=await client();
  controls.setActive(fixture);controls.renderDetail();
  node('manuscriptFile').files=[{name:'huge.pdf',size:101*1024*1024,arrayBuffer:async()=>{throw Error('should not read oversized file')}}];
  await node('manuscriptFile').listeners.get('change')();
  assert.match(node('digestStatus').textContent,/100MB/);
  assert.equal(node('manuscriptDigest').value,'');
  assert.ok(!requests.some(x=>x.url.endsWith('/transition')));
});

test('publication page clearly explains local file hashing is not manuscript ingestion',()=>{
  const html=readFileSync(new URL('../publishing/human/manage/index.html',import.meta.url),'utf8');
  for(const id of ['manuscriptFile','releaseFile','manuscriptDigest','releaseDigest','digestStatus'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/이 단계에서 파일 내용은 서버로 전송·입고되지 않습니다/);
  assert.match(html,/readonly/);
});

test('sale-readiness diagnostic does not falsely announce a completed approval',async()=>{
  const {node,controls}=await client();
  controls.setActive(fixture);controls.renderDetail();
  await node('actions').children.find(x=>x.textContent==='판매 준비조건 확인').listeners.get('click')();
  assert.match(node('result').textContent,/판매 불가:/);
  assert.doesNotMatch(node('result').textContent,/처리 완료/);
});
