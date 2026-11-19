import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createApp, checkSelection, composeDraft, parseRecipientCsv, renderAdmin, renderPublicFeed, SEED_GROUPS, visibilityAllowed, periodLabelFor,
} from '../ministry-news-core.js';
import { createMemoryStore } from '../ministry-news-memory-store.js';
import { authenticate, createConnectedMailer } from '../ministry-news-worker.js';
import staging from '../ministry-news-staging-worker.js';

const ORIGIN = 'https://ekodi.kr';
const SESSIONS = {
  op: { userId: 'u-op', email: 'joseph@ekodi.kr', role: 'operator', orgs: ['church', 'mission'] },
  staff: { userId: 'u-staff', email: 'staff@example.com', role: 'staff', orgs: ['church'] },
  mission: { userId: 'u-m', email: 'm@example.com', role: 'tenant_admin', orgs: ['mission'] },
};

function harness({ mailConfigured = true, failFor = new Set() } = {}) {
  const store = createMemoryStore();
  const sent = [];
  const mailer = {
    async status() { return { church: { address: 'ekodichurch@gmail.com', ready: mailConfigured }, mission: { address: 'ekodimission@gmail.com', ready: mailConfigured } }; },
    async send(session, org, msg) { if (failFor.has(msg.to)) throw new Error('smtp boom'); sent.push({ ...msg, org }); return `m-${sent.length}`; },
  };
  const app = createApp({
    store, mailer,
    authenticate: async request => {
      const who = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      return SESSIONS[who] ? { data: SESSIONS[who] } : { response: new Response('{"error":"login"}', { status: 401 }) };
    },
  });
  const call = async (path, { method = 'GET', body, as } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (as) headers.authorization = `Bearer ${as}`;
    const response = await app(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    const text = await response.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  };
  return { store, sent, call };
}

async function addItem(call, as, fields) {
  const r = await call('/api/sosik/admin/items', { method: 'POST', as, body: { eventDate: '2026-11-02', summary: '요약', ...fields } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.item;
}

test('seed groups in the migration match the core seed list', () => {
  const sql = readFileSync(new URL('../migrations/202611071600_ministry_news_hub.sql', import.meta.url), 'utf8');
  for (const group of SEED_GROUPS) assert.ok(sql.includes(`('${group.id}', '${group.org}', '${group.name}', '${group.channel}'`), group.id);
  assert.match(sql, /visibility TEXT NOT NULL DEFAULT 'partners'/);
  assert.match(sql, /UNIQUE \(dispatch_id, recipient_id\)/);
  assert.doesNotMatch(sql, /\bDROP\b|\bDELETE FROM\b/i);
});

test('visibility rules: public everywhere, partners never on the site, private nowhere', () => {
  assert.equal(visibilityAllowed('public', 'site'), true);
  assert.equal(visibilityAllowed('partners', 'site'), false);
  assert.equal(visibilityAllowed('partners', 'email'), true);
  assert.equal(visibilityAllowed('report', 'email'), false);
  assert.equal(visibilityAllowed('report', 'web_submit'), true);
  for (const channel of ['site', 'email', 'web_submit']) assert.equal(visibilityAllowed('private', channel), false);
});

test('selection check rejects mixing church items into a mission dispatch and over-exposed items', () => {
  const groups = SEED_GROUPS.map(g => ({ ...g, active: 1 }));
  const site = groups.find(g => g.id === 'public-site');
  const church = groups.find(g => g.id === 'church-supporters');
  const result = checkSelection({ org: 'mission', items: [{ title: '교회 소식', org: 'church', visibility: 'public' }, { title: '비공개', org: 'mission', visibility: 'partners' }], groups: [site, church] });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => p.includes('교회 후원자')));
  assert.ok(result.problems.some(p => p.includes('교회 소식')));
  assert.ok(result.problems.some(p => p.includes('비공개') && p.includes('사이트 공개')));
});

test('draft composition: letter, report, period and per-org donation footer', () => {
  const items = [
    { title: '토요모임', summary: '유학생 12명', eventDate: '2026-10-04', kind: 'activity' },
    { title: '건강', summary: '유학생들의 건강', eventDate: '2026-11-02', kind: 'prayer' },
  ];
  assert.equal(periodLabelFor(items), '2026년 10월–11월');
  const letter = composeDraft({ org: 'mission', kind: 'letter', items });
  assert.match(letter.subject, /^\[에코디선교회\] 2026년 10월–11월 선교편지$/);
  assert.match(letter.body, /■ 사역 소식[\s\S]*토요모임[\s\S]*■ 함께 기도해 주세요[\s\S]*건강/);
  assert.match(letter.body, /기부금영수증이 발급되지 않습니다/);
  const report = composeDraft({ org: 'church', kind: 'report', items, periodLabel: '2026년 4분기' });
  assert.equal(report.subject, '[에코디교회] 2026년 4분기 사역보고 및 기도요청');
  assert.match(report.body, /1\. 주요 사역 활동[\s\S]*2\. 기도요청/);
  assert.match(report.body, /기부금영수증 발급이 가능합니다/);
});

test('csv paste parsing tolerates headers, tabs and order', () => {
  const { rows, rejected } = parseRecipientCsv('이름,이메일,전화\n홍길동, Hong@Example.com, 010-1234-5678\nlee@example.org\t이영희\n잘못된 줄');
  assert.deepEqual(rows, [
    { name: '홍길동', email: 'hong@example.com', phone: '010-1234-5678' },
    { name: '이영희', email: 'lee@example.org', phone: '' },
  ]);
  assert.deepEqual(rejected, ['잘못된 줄']);
});

test('public page and feed show only public, active items', async () => {
  const { call } = harness();
  const pub = await addItem(call, 'op', { org: 'mission', title: '공개 소식', visibility: 'public' });
  await addItem(call, 'op', { org: 'mission', title: '후원자 전용 소식', visibility: 'partners' });
  await addItem(call, 'op', { org: 'church', title: '교회 공개 소식', visibility: 'public' });
  const page = await call('/sosik?org=mission');
  assert.equal(page.status, 200);
  assert.ok(page.data.includes('공개 소식'));
  assert.ok(!page.data.includes('후원자 전용 소식'));
  assert.ok(!page.data.includes('교회 공개 소식'));
  const feed = await call('/api/sosik/feed');
  assert.deepEqual(feed.data.items.map(i => i.title).sort(), ['공개 소식', '교회 공개 소식']);
  assert.equal(feed.headers.get('access-control-allow-origin'), 'https://ekodi.kr');
  await call(`/api/sosik/admin/items/${pub.id}`, { method: 'DELETE', as: 'op' });
  assert.ok(!(await call('/sosik')).data.includes('>공개 소식<'));
  assert.ok(!renderPublicFeed([{ title: 'X', visibility: 'partners', org: 'mission', status: 'active' }]).includes('>X<'));
});

test('admin API fails closed and scopes by organisation', async () => {
  const { call } = harness();
  assert.equal((await call('/api/sosik/admin/items')).status, 401);
  const forbidden = await call('/api/sosik/admin/items', { method: 'POST', as: 'staff', body: { org: 'mission', title: 'x' } });
  assert.equal(forbidden.status, 403);
  await addItem(call, 'mission', { org: 'mission', title: '선교회 내부 기록', visibility: 'partners' });
  const staffView = await call('/api/sosik/admin/items', { as: 'staff' });
  assert.ok(!staffView.data.items.some(i => i.title === '선교회 내부 기록'));
  const draft = await call('/api/sosik/admin/dispatches', { method: 'POST', as: 'staff', body: { org: 'mission', itemIds: [], groupIds: [] } });
  assert.equal(draft.status, 403);
});

test('full flow: check-select → draft → approve → send once to consented recipients → history', async () => {
  const { call, sent, store } = harness();
  const a = await addItem(call, 'op', { org: 'mission', kind: 'activity', title: '열린식탁', visibility: 'partners' });
  const b = await addItem(call, 'op', { org: 'shared', kind: 'prayer', title: '비자 연장 기도', visibility: 'partners' });

  const imp = await call('/api/sosik/admin/recipients/import', { method: 'POST', as: 'op', body: { groupId: 'mission-supporters', consentConfirmed: true, text: '김후원, kim@example.com\n박후원, park@example.com\n중복, dup@example.com' } });
  assert.equal(imp.data.added, 3);
  const noConsent = await call('/api/sosik/admin/recipients/import', { method: 'POST', as: 'op', body: { groupId: 'prayer-partners', text: 'a@b.co' } });
  assert.equal(noConsent.status, 400);
  await call('/api/sosik/admin/recipients/import', { method: 'POST', as: 'op', body: { groupId: 'prayer-partners', consentConfirmed: true, text: 'dup@example.com\npray@example.com' } });

  // park unsubscribes through the public link
  const park = (await store.listRecipients('mission-supporters')).find(r => r.email === 'park@example.com');
  const unsubPage = await call(`/sosik/unsubscribe?t=${park.unsubToken}`);
  assert.ok(unsubPage.data.includes('수신거부'));
  assert.equal((await call('/api/sosik/unsubscribe', { method: 'POST', body: { token: park.unsubToken } })).status, 200);

  // over-exposure is refused before anything is drafted
  const bad = await call('/api/sosik/admin/dispatches', { method: 'POST', as: 'op', body: { org: 'mission', itemIds: [a.id], groupIds: ['public-site'] } });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.problems.length);

  const created = await call('/api/sosik/admin/dispatches', { method: 'POST', as: 'op', body: { org: 'mission', kind: 'letter', itemIds: [a.id, b.id], groupIds: ['mission-supporters', 'prayer-partners', 'kfm'] } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.dispatch.id;
  assert.equal(created.data.dispatch.status, 'DRAFT');

  assert.equal((await call(`/api/sosik/admin/dispatches/${id}/send`, { method: 'POST', as: 'op' })).status, 409, 'cannot send before approval');
  const edited = await call(`/api/sosik/admin/dispatches/${id}`, { method: 'PUT', as: 'op', body: { subject: '[에코디선교회] 11월 선교편지', body: created.data.dispatch.body + '\n추신' } });
  assert.equal(edited.data.dispatch.subject, '[에코디선교회] 11월 선교편지');
  assert.equal((await call(`/api/sosik/admin/dispatches/${id}/approve`, { method: 'POST', as: 'staff' })).status, 404, 'church staff cannot even see a mission dispatch');
  assert.equal((await call(`/api/sosik/admin/dispatches/${id}/approve`, { method: 'POST', as: 'op' })).status, 200);
  assert.equal((await call(`/api/sosik/admin/dispatches/${id}`, { method: 'PUT', as: 'op', body: { subject: 'x' } })).status, 409, 'approved is frozen');

  const first = await call(`/api/sosik/admin/dispatches/${id}/send`, { method: 'POST', as: 'op' });
  assert.equal(first.status, 200);
  assert.deepEqual(sent.map(m => m.to).sort(), ['dup@example.com', 'kim@example.com', 'pray@example.com']);
  assert.ok(sent.every(m => m.subject === '[에코디선교회] 11월 선교편지'));
  assert.ok(sent.every(m => m.org === 'mission'), 'mission letters leave from the mission account');
  assert.ok(sent.every(m => /\/sosik\/unsubscribe\?t=[0-9a-f]{64}/.test(m.body)), 'every letter carries an unsubscribe link');
  assert.ok(sent.find(m => m.to === 'kim@example.com').body.startsWith('김후원 님께'));
  assert.equal(first.data.dispatch.status, 'PARTIAL', 'web submission to 한국외국인선교회 still pending');

  const again = await call(`/api/sosik/admin/dispatches/${id}/send`, { method: 'POST', as: 'op' });
  assert.equal(again.data.sentNow, 0);
  assert.equal(sent.length, 3, 'no duplicate sends');

  const submitted = await call(`/api/sosik/admin/dispatches/${id}/submitted`, { method: 'POST', as: 'op', body: { groupId: 'kfm' } });
  assert.equal(submitted.data.dispatch.status, 'SENT');
  assert.deepEqual(submitted.data.dispatch.submissions, ['kfm']);

  const log = await call('/api/sosik/admin/dispatches', { as: 'op' });
  assert.equal(log.data.dispatches[0].sentCount, 3);
  const items = await call('/api/sosik/admin/items', { as: 'op' });
  assert.equal(items.data.items.find(i => i.id === a.id).sentCount, 1);

  const resend = await call('/api/sosik/admin/dispatches', { method: 'POST', as: 'op', body: { org: 'mission', itemIds: [a.id], groupIds: ['mission-supporters'] } });
  assert.ok(resend.data.dispatch.alreadySent.some(w => w.includes('열린식탁')), 'duplicate-send warning');

  const doc = await call(`/api/sosik/admin/dispatches/${id}/export`, { as: 'op' });
  assert.equal(doc.headers.get('content-type'), 'application/msword; charset=utf-8');
  assert.ok(doc.data.includes('11월 선교편지'));
  assert.ok(store._db.audit.some(e => e.action === 'sosik.dispatch.send'));
});

test('failed sends are retried, not duplicated; mail-off blocks sending but not approval', async () => {
  const failing = harness({ failFor: new Set(['kim@example.com']) });
  const item = await addItem(failing.call, 'op', { org: 'church', title: '교회 소식', visibility: 'partners' });
  await failing.call('/api/sosik/admin/recipients/import', { method: 'POST', as: 'op', body: { groupId: 'church-supporters', consentConfirmed: true, text: 'kim@example.com\nlee@example.com' } });
  const d = (await failing.call('/api/sosik/admin/dispatches', { method: 'POST', as: 'op', body: { org: 'church', itemIds: [item.id], groupIds: ['church-supporters'] } })).data.dispatch;
  await failing.call(`/api/sosik/admin/dispatches/${d.id}/approve`, { method: 'POST', as: 'op' });
  const r1 = await failing.call(`/api/sosik/admin/dispatches/${d.id}/send`, { method: 'POST', as: 'op' });
  assert.equal(r1.data.failedNow, 1);
  assert.equal(r1.data.dispatch.status, 'PARTIAL');

  const off = harness({ mailConfigured: false });
  const i2 = await addItem(off.call, 'op', { org: 'church', title: 'x', visibility: 'public' });
  const d2 = (await off.call('/api/sosik/admin/dispatches', { method: 'POST', as: 'op', body: { org: 'church', itemIds: [i2.id], groupIds: ['church-supporters'] } })).data.dispatch;
  assert.equal((await off.call(`/api/sosik/admin/dispatches/${d2.id}/approve`, { method: 'POST', as: 'op' })).status, 200);
  assert.equal((await off.call(`/api/sosik/admin/dispatches/${d2.id}/send`, { method: 'POST', as: 'op' })).status, 409);
  assert.equal((await off.call('/api/sosik/admin/me', { as: 'op' })).data.mail, false);
});

test('site-only dispatch completes on approval; church staff cannot approve', async () => {
  const { call } = harness();
  const item = await addItem(call, 'staff', { org: 'church', title: '공개 소식', visibility: 'public' });
  const d = (await call('/api/sosik/admin/dispatches', { method: 'POST', as: 'staff', body: { org: 'church', itemIds: [item.id], groupIds: ['public-site'] } })).data.dispatch;
  assert.equal((await call(`/api/sosik/admin/dispatches/${d.id}/approve`, { method: 'POST', as: 'staff' })).status, 403);
  const ok = await call(`/api/sosik/admin/dispatches/${d.id}/approve`, { method: 'POST', as: 'op' });
  assert.equal(ok.data.dispatch.status, 'SENT');
});

test('public subscribe requires consent, ignores bots, and re-consents on repeat', async () => {
  const { call, store } = harness();
  assert.equal((await call('/sosik/subscribe')).status, 200);
  assert.equal((await call('/api/sosik/subscribe', { method: 'POST', body: { email: 'a@example.com', groups: ['prayer-partners'] } })).status, 400);
  assert.equal((await call('/api/sosik/subscribe', { method: 'POST', body: { email: 'a@example.com', groups: ['kfm'], consent: true } })).status, 400, 'non-public groups are not subscribable');
  assert.equal((await call('/api/sosik/subscribe', { method: 'POST', body: { email: 'bot@example.com', groups: ['prayer-partners'], consent: true, website: 'spam' } })).status, 200);
  assert.equal((await store.listRecipients()).length, 0);
  const ok = await call('/api/sosik/subscribe', { method: 'POST', body: { name: '정', email: 'A@Example.com', groups: ['prayer-partners', 'church-supporters'], consent: true } });
  assert.equal(ok.status, 200);
  assert.match(ok.data.message, /정상적으로 접수/);
  const rows = await store.listRecipients();
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.email === 'a@example.com' && r.consentSource === 'subscribe_form'));
  await store.updateRecipient(rows[0].id, { unsubscribedAt: '2026-11-07T00:00:00Z' });
  await call('/api/sosik/subscribe', { method: 'POST', body: { email: 'a@example.com', groups: ['prayer-partners'], consent: true } });
  assert.equal((await store.listRecipients()).length, 2);
  assert.ok((await store.listRecipients()).every(r => !r.unsubscribedAt));
});

test('production authenticate: operator, church staff, mission admin, nobody', async () => {
  const req = token => new Request('https://ekodi.kr/api/sosik/admin/me', { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const env = { OPERATOR_EMAILS: 'joseph@ekodi.kr, topmaster.joseph@gmail.com' };
  const fetcher = (who, { staff = null, tenant = null } = {}) => async url => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return Response.json(who ? { id: 'u1', email: who, email_confirmed_at: '2026-01-01' } : {}, { status: who ? 200 : 401 });
    if (u.includes('church-pastor-api')) return Response.json(staff ? [{ role: staff }] : []);
    if (u.includes('current_site_activity_contexts')) return Response.json(tenant ? [{ tenant: 'ekodimission', authorization_role: tenant }] : []);
    throw new Error('unexpected ' + u);
  };
  assert.equal((await authenticate(req(''), env, fetcher(null))).response.status, 401);
  assert.equal((await authenticate(req('t'), env, fetcher(null))).response.status, 401);
  assert.deepEqual((await authenticate(req('t'), env, fetcher('Joseph@EKODI.kr'))).data.orgs, ['church', 'mission']);
  const pastor = (await authenticate(req('t'), env, fetcher('p@x.kr', { staff: 'senior_pastor' }))).data;
  assert.deepEqual([pastor.role, pastor.orgs], ['senior_pastor', ['church']]);
  assert.deepEqual((await authenticate(req('t'), env, fetcher('m@x.kr', { tenant: 'tenant_admin' }))).data.orgs, ['mission']);
  assert.equal((await authenticate(req('t'), env, fetcher('v@x.kr', { staff: 'viewer' }))).response.status, 403);
});

test('admin page renders and its inline client is valid JavaScript', () => {
  const page = renderAdmin();
  assert.ok(page.includes('사역소식 발행관리'));
  const script = page.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
  assert.ok(!page.includes('token=') , 'access token is never placed in a URL');
});

test('staging worker is isolated and fails closed', async () => {
  const pub = await staging.fetch(new Request('https://staging.invalid/sosik'));
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get('x-ekodi-data-mode'), 'isolated-staging');
  const body = await pub.text();
  assert.ok(body.includes('사역소식'));
  assert.ok(!body.includes('후원자에게만 보이는 예시'));
  const api = await staging.fetch(new Request('https://staging.invalid/api/sosik/admin/me'));
  assert.equal(api.status, 401);
  assert.equal((await api.json()).error, 'staging_auth_required');
  const wrangler = readFileSync(new URL('../wrangler.ministry-news.staging.toml', import.meta.url), 'utf8');
  assert.ok(!wrangler.includes('[[d1_databases]]'));
});

test('institution report (한국외국인선교회 본부) goes by mail to registered addresses, without unsubscribe footer', async () => {
  const { call, sent } = harness();
  assert.equal((await call('/api/sosik/admin/groups/kfm', { method: 'PUT', as: 'op', body: { contactEmail: 'not-an-email' } })).status, 400);
  const many = Array.from({ length: 11 }, (_, i) => `a${i}@example.org`).join(',');
  assert.equal((await call('/api/sosik/admin/groups/kfm', { method: 'PUT', as: 'op', body: { contactEmail: many } })).status, 400);
  const saved = await call('/api/sosik/admin/groups/kfm', { method: 'PUT', as: 'op', body: { contactEmail: 'HQ@example.org; second@example.org\nhq@example.org' } });
  assert.equal(saved.data.group.contactEmail, 'hq@example.org, second@example.org');
  assert.equal(saved.data.group.channel, 'web_submit');
  const groups = await call('/api/sosik/admin/groups', { as: 'op' });
  assert.equal(groups.data.groups.find(g => g.id === 'kfm').activeCount, 2);

  const item = await addItem(call, 'op', { org: 'mission', kind: 'activity', title: '유학생 토요모임', visibility: 'report' });
  const prayer = await addItem(call, 'op', { org: 'mission', kind: 'prayer', title: '2학기 사역', visibility: 'partners' });
  const created = await call('/api/sosik/admin/dispatches', { method: 'POST', as: 'op', body: { org: 'mission', kind: 'report', itemIds: [item.id, prayer.id], groupIds: ['kfm'] } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.match(created.data.dispatch.body, /보고 기관: 에코디선교회 \(한국외국인선교회 무안지부\)/);
  const id = created.data.dispatch.id;
  await call(`/api/sosik/admin/dispatches/${id}/approve`, { method: 'POST', as: 'op' });
  const r = await call(`/api/sosik/admin/dispatches/${id}/send`, { method: 'POST', as: 'op' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(sent.map(m => m.to).sort(), ['hq@example.org', 'second@example.org']);
  assert.ok(sent.every(m => m.org === 'mission' && !m.body.includes('/sosik/unsubscribe') && !m.body.includes('님께')));
  assert.equal(r.data.dispatch.status, 'SENT');
  assert.deepEqual(r.data.dispatch.submissions, ['kfm']);
  assert.match(r.data.message, /ekodimission@gmail\.com/);
  const again = await call(`/api/sosik/admin/dispatches/${id}/send`, { method: 'POST', as: 'op' });
  assert.equal(again.status, 409, 'a completed dispatch is not resent');
  assert.equal(sent.length, 2);

  const reportOnlyToSupporters = await call('/api/sosik/admin/dispatches', { method: 'POST', as: 'op', body: { org: 'mission', itemIds: [item.id], groupIds: ['mission-supporters'] } });
  assert.equal(reportOnlyToSupporters.status, 400, 'report-only items never reach supporter mail');
});

test('church letters leave from the church account; an unready sender blocks sending with the connect link', async () => {
  const { call, sent, store } = harness();
  const item = await addItem(call, 'op', { org: 'church', title: '추수감사 주일', visibility: 'partners' });
  await call('/api/sosik/admin/recipients/import', { method: 'POST', as: 'op', body: { groupId: 'church-supporters', consentConfirmed: true, text: 'a@example.com' } });
  const d = (await call('/api/sosik/admin/dispatches', { method: 'POST', as: 'op', body: { org: 'church', itemIds: [item.id], groupIds: ['church-supporters'] } })).data.dispatch;
  await call(`/api/sosik/admin/dispatches/${d.id}/approve`, { method: 'POST', as: 'op' });
  await call(`/api/sosik/admin/dispatches/${d.id}/send`, { method: 'POST', as: 'op' });
  assert.deepEqual(sent.map(m => [m.org, m.to]), [['church', 'a@example.com']]);

  const off = harness({ mailConfigured: false });
  const i2 = await addItem(off.call, 'op', { org: 'church', title: 'x', visibility: 'partners' });
  const d2 = (await off.call('/api/sosik/admin/dispatches', { method: 'POST', as: 'op', body: { org: 'church', itemIds: [i2.id], groupIds: ['church-supporters'] } })).data.dispatch;
  await off.call(`/api/sosik/admin/dispatches/${d2.id}/approve`, { method: 'POST', as: 'op' });
  const blocked = await off.call(`/api/sosik/admin/dispatches/${d2.id}/send`, { method: 'POST', as: 'op' });
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /ekodichurch@gmail\.com/);
  assert.equal(blocked.data.connectUrl, 'https://ekodi.kr/mail/admin');
  const me = await off.call('/api/sosik/admin/me', { as: 'op' });
  assert.deepEqual(me.data.senders.church, { address: 'ekodichurch@gmail.com', ready: false, reason: '' });
  assert.ok(!JSON.stringify(me.data).includes('token'));
  void store;
});

test('connected mailer: picks the org account from EKODI Mail, explains why it is not ready, sends via CONTROL_API', async () => {
  const calls = [];
  const accounts = [
    { id: 11, emailAddress: 'EkodiChurch@gmail.com', provider: 'gmail', connectionStatus: 'connected', enabled: true, permissions: { send: true } },
    { id: 12, emailAddress: 'ekodimission@gmail.com', provider: 'gmail', connectionStatus: 'connected', enabled: true, permissions: { send: false } },
  ];
  const call = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/api/mail/control/accounts')) return Response.json({ accounts });
    if (url.endsWith('/accounts/11/send')) return Response.json({ ok: true, id: 'gm-1' });
    return Response.json({ error: 'nope' }, { status: 404 });
  };
  const mailer = createConnectedMailer({ SENDER_CHURCH: 'ekodichurch@gmail.com', SENDER_MISSION: 'ekodimission@gmail.com' }, call);
  const session = { token: 'tok-1' };
  const status = await mailer.status(session);
  assert.equal(status.church.ready, true);
  assert.equal(status.mission.ready, false);
  assert.match(status.mission.reason, /발송 권한이 없습니다/);
  const id = await mailer.send(session, 'church', { to: 'x@example.com', subject: '[에코디교회] 11월 선교편지', body: '본문' });
  assert.equal(id, 'gm-1');
  const post = calls.find(c => c.url.endsWith('/send'));
  assert.equal(post.init.headers.authorization, 'Bearer tok-1');
  const payload = JSON.parse(post.init.body);
  assert.equal(payload.to, 'x@example.com');
  assert.match(payload.subject, /^=\?UTF-8\?B\?/);
  assert.equal(Buffer.from(payload.subject.slice(10, -2), 'base64').toString('utf8'), '[에코디교회] 11월 선교편지');
  await assert.rejects(() => mailer.send(session, 'mission', { to: 'x@example.com', subject: 's', body: 'b' }), /발송 권한/);
  assert.equal(calls.filter(c => c.url.endsWith('/accounts')).length, 1, 'account list is fetched once per session');

  const none = createConnectedMailer({ SENDER_CHURCH: 'ekodichurch@gmail.com' }, null);
  const st = await none.status({ token: 't' });
  assert.equal(st.church.ready, false);
  assert.equal(st.mission.reason, '보내는 메일 미지정');
  const missing = createConnectedMailer({ SENDER_CHURCH: 'ekodichurch@gmail.com' }, async () => Response.json({ accounts: [] }));
  assert.match((await missing.status({ token: 't' })).church.reason, /연결되지 않은 계정/);
});

test('production config: org senders, CONTROL_API binding, and no mail secrets in the worker', () => {
  const toml = readFileSync(new URL('../wrangler.ministry-news.toml', import.meta.url), 'utf8');
  assert.match(toml, /SENDER_CHURCH = "ekodichurch@gmail\.com"/);
  assert.match(toml, /SENDER_MISSION = "ekodimission@gmail\.com"/);
  assert.match(toml, /binding = "CONTROL_API"\nservice = "ekodi-auth-api"/);
  const worker = readFileSync(new URL('../ministry-news-worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /GMAIL_REFRESH_TOKEN|GMAIL_CLIENT_SECRET/);
});
