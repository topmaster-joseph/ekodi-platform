import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COOPERATIVES } from '../cooperative-registry.js';
import { routeCooperative } from '../cooperative-control.js';
import { COOP_PRINTABLE_DOCUMENTS, SIGNATURE_RULES, cooperativeDocumentHtml } from '../cooperative-documents.js';
import { sniffSignatureFile, validateSignatureRequest } from '../cooperative-signatures.js';
import { cooperativeInitialState } from '../cooperative-registry.js';
import { cooperativeScript } from '../cooperative-ui.js';
import { cooperativePage } from '../cooperative-page.js';
import { fixture, authFetch } from './helpers/cooperative-fixture.mjs';

const [jubilee, open] = COOPERATIVES;
const PDF = new Uint8Array([...Buffer.from('%PDF-1.7\n'), ...new Uint8Array(400).fill(32)]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Uint8Array(300)]);

function memoryBucket() {
  const objects = new Map();
  return { objects,
    async put(key, value, options) { objects.set(key, { bytes: new Uint8Array(value), options }); },
    async get(key) { const o = objects.get(key); return o ? { body: o.bytes } : null; },
    async delete(key) { objects.delete(key); } };
}

function setup(t) {
  const f = fixture();
  t.after(() => f.sqlite.close());
  f.sqlite.exec(fs.readFileSync(new URL('../migrations/202611172300_cooperative_signature_requests.sql', import.meta.url), 'utf8'));
  f.sqlite.exec(fs.readFileSync(new URL('../migrations/202611091100_workspace_documents.sql', import.meta.url), 'utf8'));
  t.mock.method(globalThis, 'fetch', authFetch({ owner: 'owner@example.test', member: 'member@example.test', other: 'other@example.test' }));
  f.grant(jubilee, 'owner@example.test', 'owner');
  f.grant(jubilee, 'member@example.test', 'member');
  f.grant(open, 'other@example.test', 'owner');
  const bucket = memoryBucket();
  const env = { ...f.env, COOP_SIGNATURE_FILES: bucket };
  const call = (coop, path, { token = '', method = 'GET', body, sign = '', raw, headers = {} } = {}) => routeCooperative(new Request(`https://ekodi.kr/${coop.publicSlug}/api${path}`, {
    method,
    headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(sign ? { 'x-ekodi-sign-token': sign } : {}), ...(body ? { origin: 'https://ekodi.kr', 'content-type': 'application/json' } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  }), env);
  return { f, env, bucket, call };
}

const upload = (call, coop, sign, bytes, origin = 'https://ekodi.kr') => {
  const form = new FormData();
  form.append('file', new Blob([bytes]), 'scan.bin');
  return call(coop, '/sign/upload', { method: 'POST', sign, raw: form, headers: { origin } });
};

test('every printable document renders from saved state with escaped values and the right signature lines', () => {
  const state = cooperativeInitialState(jubilee);
  state.founders[1].representative = '<script>alert(1)</script>';
  state.founders[0].phone = '010-1234-5678';
  state.founders[0].businessNumber = '123-45-67890';
  for (const [key] of COOP_PRINTABLE_DOCUMENTS) {
    const html = cooperativeDocumentHtml(jubilee, state, key);
    assert.match(html, /class="print-doc"/, key);
    assert.doesNotMatch(html, /<script>/, key);
    assert.doesNotMatch(html, /010-1234-5678|123-45-67890/, key + ' keeps phone and business numbers off paper');
    assert.match(html, /검토용 초안/, key);
    if (SIGNATURE_RULES[key].required) assert.match(html, /서명 또는 인|print-sign-cell/, key);
  }
  const personal = cooperativeDocumentHtml(jubilee, state, 'consent', { founderId: state.founders[2].id });
  assert.equal((personal.match(/설립동의서<\/h2>/g) || []).length, 1, 'a personal link shows only that person');
  assert.match(personal, new RegExp(state.founders[2].representative));
  assert.equal((cooperativeDocumentHtml(jubilee, state, 'consent').match(/설립동의서<\/h2>/g) || []).length, state.founders.length);
  assert.throws(() => cooperativeDocumentHtml(jubilee, state, 'unknown'), /COOP_DOCUMENT_UNKNOWN/);
});

test('file type is decided by content, not by the declared name', () => {
  assert.equal(sniffSignatureFile(PDF).mime, 'application/pdf');
  assert.equal(sniffSignatureFile(PNG).mime, 'image/png');
  assert.equal(sniffSignatureFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])).mime, 'image/jpeg');
  assert.equal(sniffSignatureFile(Buffer.from('<html>not a scan</html>')), null);
  const state = cooperativeInitialState(jubilee);
  assert.throws(() => validateSignatureRequest({ documentKey: 'charter', founderIds: [] }, state), /SIGNERS_REQUIRED/);
  assert.throws(() => validateSignatureRequest({ documentKey: 'charter', founderIds: ['x'] }, state), /FOUNDER_NOT_FOUND/);
  assert.throws(() => validateSignatureRequest({ documentKey: 'charter', founderIds: [state.founders[0].id], days: 31 }, state), /DAYS_INVALID/);
  assert.throws(() => validateSignatureRequest({ documentKey: 'charter', founderIds: [state.founders[0].id], kind: 'stamp' }, state), /KIND_INVALID/);
});

test('admin prints documents and sends per-person links; members and other cooperatives cannot', async t => {
  const { call } = setup(t);
  const doc = await call(jubilee, '/documents/charter', { token: 'owner' });
  assert.equal(doc.status, 200);
  assert.match(doc.headers.get('content-type'), /text\/html/);
  assert.match(doc.headers.get('cache-control'), /no-store/);
  assert.match(await doc.text(), /희년세상협동조합/);
  assert.equal((await call(jubilee, '/documents/charter', { token: 'member' })).status, 403);
  assert.equal((await call(jubilee, '/documents/charter', { token: 'other' })).status, 403, 'another cooperative admin is not this cooperative admin');
  assert.equal((await call(jubilee, '/documents/charter')).status, 401);
  assert.equal((await call(jubilee, '/signatures', { token: 'member' })).status, 403);

  const state = cooperativeInitialState(jubilee);
  const created = await call(jubilee, '/signatures', { token: 'owner', method: 'POST', body: { documentKey: 'charter', founderIds: state.founders.map(f => f.id), kind: 'either', message: '서명 부탁드립니다' } });
  assert.equal(created.status, 201);
  const result = await created.json();
  assert.equal(result.links.length, 5);
  for (const link of result.links) assert.match(link.link, /^https:\/\/ekodi\.kr\/jubilee\/sign#[A-Za-z0-9_-]{43}$/);
  assert.equal(new Set(result.links.map(l => l.link)).size, 5, 'every person gets a distinct link');

  const list = await (await call(jubilee, '/signatures', { token: 'owner' })).json();
  assert.equal(list.requests.length, 5);
  assert.ok(list.requests.every(r => r.status === 'requested' && !('link' in r) && !('token_hash' in r)), 'link secrets are never listed again');
  assert.equal((await (await call(open, '/signatures', { token: 'other' })).json()).requests.length, 0, 'requests are cooperative scoped');

  const bad = await call(jubilee, '/signatures', { token: 'owner', method: 'POST', body: { documentKey: 'charter', founderIds: [state.founders[0].id] }, headers: { origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
});

test('a signer opens the link without login, uploads a scan, and the admin reviews it', async t => {
  const { f, call, bucket } = setup(t);
  const state = cooperativeInitialState(jubilee);
  const created = await (await call(jubilee, '/signatures', { token: 'owner', method: 'POST', body: { documentKey: 'consent', founderIds: [state.founders[1].id], kind: 'seal', days: 3 } })).json();
  const sign = created.links[0].link.split('#')[1];

  const view = await call(jubilee, '/sign/request', { sign });
  assert.equal(view.status, 200);
  const data = await view.json();
  assert.equal(data.request.signerName, state.founders[1].representative);
  assert.equal(data.request.documentLabel, '설립동의서(개인별)');
  assert.equal((data.documentHtml.match(/설립동의서<\/h2>/g) || []).length, 1);
  assert.equal((await call(open, '/sign/request', { sign })).status, 401, 'a link only works on its own cooperative');
  assert.equal((await call(jubilee, '/sign/request', { sign: 'x'.repeat(43) })).status, 401);

  assert.equal((await upload(call, jubilee, sign, PDF, 'https://evil.example')).status, 403);
  assert.equal((await upload(call, jubilee, sign, Buffer.from('<html>' + ' '.repeat(200) + '</html>'))).status, 415);
  const sent = await upload(call, jubilee, sign, PDF);
  assert.equal(sent.status, 201);
  assert.equal(bucket.objects.size, 1);
  const [key] = bucket.objects.keys();
  assert.match(key, /^workspace\/jubilee-distribution\/documents\/coop-signatures\/csr-/);
  const boxed = f.sqlite.prepare("SELECT tenant_slug, title, file_key FROM workspace_documents WHERE tenant_slug = 'jubilee-distribution'").all();
  assert.equal(boxed.length, 1);
  assert.equal(boxed[0].tenant_slug, 'jubilee-distribution');
  assert.equal(boxed[0].file_key, key, 'the site document box points at the same private original');

  const [row] = (await (await call(jubilee, '/signatures', { token: 'owner' })).json()).requests;
  assert.equal(row.status, 'uploaded');
  const file = await call(jubilee, `/signatures/${row.id}/file`, { token: 'owner' });
  assert.equal(file.status, 200);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), PDF);
  assert.equal((await call(jubilee, `/signatures/${row.id}/file`, { token: 'member' })).status, 403);

  assert.equal((await call(jubilee, `/signatures/${row.id}/review`, { token: 'owner', method: 'POST', body: { decision: 'rejected' } })).status, 400, 'a rejection needs a reason');
  assert.equal((await call(jubilee, `/signatures/${row.id}/review`, { token: 'owner', method: 'POST', body: { decision: 'rejected', note: '도장이 흐립니다' } })).status, 200);
  const again = await (await call(jubilee, '/sign/request', { sign })).json();
  assert.equal(again.request.reviewNote, '도장이 흐립니다');
  assert.equal((await upload(call, jubilee, sign, PNG)).status, 201, 'the same link can resubmit after a rejection');
  assert.equal((await call(jubilee, `/signatures/${row.id}/review`, { token: 'owner', method: 'POST', body: { decision: 'accepted' } })).status, 200);
  assert.equal((await call(jubilee, '/sign/request', { sign })).status, 401, 'an accepted request closes its link');
  const events = f.sqlite.prepare('SELECT action FROM cooperative_signature_events ORDER BY created_at').all().map(e => e.action);
  for (const action of ['requested', 'uploaded', 'downloaded', 'rejected', 'accepted']) assert.ok(events.includes(action), action);
});

test('reissue invalidates the previous link, cancel closes it, and expiry is enforced', async t => {
  const { f, call } = setup(t);
  const state = cooperativeInitialState(jubilee);
  const created = await (await call(jubilee, '/signatures', { token: 'owner', method: 'POST', body: { documentKey: 'minutes', founderIds: [state.founders[0].id, state.founders[2].id] } })).json();
  const [first, second] = created.links;
  const oldToken = first.link.split('#')[1];
  const reissued = await (await call(jubilee, `/signatures/${first.id}/reissue`, { token: 'owner', method: 'POST', body: { days: 7 } })).json();
  const newToken = reissued.link.link.split('#')[1];
  assert.notEqual(newToken, oldToken);
  assert.equal((await call(jubilee, '/sign/request', { sign: oldToken })).status, 401);
  assert.equal((await call(jubilee, '/sign/request', { sign: newToken })).status, 200);

  assert.equal((await call(jubilee, `/signatures/${second.id}/cancel`, { token: 'owner', method: 'POST', body: {} })).status, 200);
  assert.equal((await call(jubilee, '/sign/request', { sign: second.link.split('#')[1] })).status, 401);

  f.sqlite.prepare("UPDATE cooperative_signature_requests SET token_expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(first.id);
  const expired = await call(jubilee, '/sign/request', { sign: newToken });
  assert.equal(expired.status, 410);
  assert.equal((await expired.json()).code, 'COOP_SIGN_LINK_EXPIRED');
  assert.equal((await upload(call, jubilee, newToken, PDF)).status, 410);
});

test('the sign page is a no-login, noindex page and the admin screen exposes print and request tools', async t => {
  const { env } = setup(t);
  const page = await routeCooperative(new Request('https://ekodi.kr/jubilee/sign'), env);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('x-robots-tag'), /noindex/);
  const html = await page.text();
  assert.match(html, /data-coop-surface="sign"/);
  assert.match(html, /id="signUpload"/);
  assert.doesNotMatch(cooperativePage(jubilee, 'sign'), /id="gate"/, 'no login gate on the signing page');
  assert.equal((await routeCooperative(new Request('https://ekodi.kr/admin/workspaces/cooperatives/jubilee-distribution/sign'), env)), null);
  const script = cooperativeScript();
  new Function(script);
  for (const marker of ['signatureDesk', 'data-doc-print', 'data-sig-open', 'sigRequestForm', 'x-ekodi-sign-token', 'print-doc-mode']) assert.ok(script.includes(marker), marker);
  const page2 = cooperativePage(jubilee, 'admin');
  assert.match(page2, /\/jubilee\/assets\/app\.js/);
});
