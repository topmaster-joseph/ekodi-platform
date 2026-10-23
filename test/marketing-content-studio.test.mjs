import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_DISCLOSURE, applyDisclosure, buildTrackedLink, composeCaption, nextVariantState, channelAccepts,
} from '../marketing-content-studio.js';
import { handleMarketingAdminControl } from '../marketing-admin-control.js';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const MIGRATION_FILES = fs.readdirSync(MIGRATIONS).filter(name => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b, 'en'));
const STUDIO = 'https://ekodi.kr/api/marketing/admin/studio';
const ADMIN_TOKEN = 'studio-admin-session-token';

// Minimal Cloudflare D1 adapter over node:sqlite that applies the REAL root migration chain.
function d1() {
  const db = new DatabaseSync(':memory:');
  for (const file of MIGRATION_FILES) db.exec(fs.readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  const statement = (sql, params = []) => ({
    bind:(...args) => statement(sql, args),
    async first() { return db.prepare(sql).get(...params) ?? null; },
    async all() { return { results:db.prepare(sql).all(...params) }; },
    async run() { const r = db.prepare(sql).run(...params); return { meta:{ changes:Number(r.changes), last_row_id:Number(r.lastInsertRowid) } }; },
  });
  return { raw:db, prepare:sql => statement(sql), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function seed({ plan = 'plus' } = {}) {
  const env = { DB:d1() };
  const raw = env.DB.raw;
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  // Real EKODI admin session (auth-worker /api/session) — studio reuses adminSession from marketing-admin-control.js.
  raw.prepare(`INSERT INTO admins(email,password_hash,password_salt,birth_hash,birth_salt,role,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run('admin@example.org', 'x', 'x', 'x', 'x', 'super_admin', now);
  raw.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256(ADMIN_TOKEN), 1, future, now);
  if (plan) {
    raw.prepare(`INSERT INTO service_subscriptions(subject_type,subject_key,site,plan_id,status,monthly_fee,created_at,updated_at)
      VALUES('tenant','studio-lab','marketing',?,'active',0,?,?)`).run(plan, now, now);
  }
  raw.prepare(`INSERT INTO marketing_content_items(subject_type,subject_key,title,caption,created_at,updated_at) VALUES('tenant','studio-lab','원본','원본 본문',?,?)`).run(now, now);
  raw.prepare(`INSERT INTO marketing_publish_channels(subject_type,subject_key,provider,channel_type,display_name,status,config_json,created_at,updated_at)
    VALUES('tenant','studio-lab','instagram','instagram_business','EKODI IG','active','{}',?,?)`).run(now, now);
  raw.prepare(`INSERT INTO marketing_publish_channels(subject_type,subject_key,provider,channel_type,display_name,status,config_json,created_at,updated_at)
    VALUES('tenant','studio-lab','youtube','youtube_channel','EKODI YT','active','{}',?,?)`).run(now, now);
  return env;
}

const call = (env, method, path, body, token = ADMIN_TOKEN) => handleMarketingAdminControl(new Request(`${STUDIO}${path}`, {
  method,
  headers:{ 'content-type':'application/json', ...(token ? { authorization:`Bearer ${token}` } : {}) },
  ...(body ? { body:JSON.stringify(body) } : {}),
}), env);
const jsonOf = async response => ({ status:response.status, body:await response.json() });
const createIg = (env, extra = {}) => call(env, 'POST', '/variants', {
  contentId:1, channel:'instagram', format:'carousel', title:'가을 신상', body:'청계면 가을 신상품을 소개합니다.',
  hashtags:['청계면','에코디'], media:['https://ekodi.kr/assets/a.jpg'], linkUrl:'https://ekodi.kr/mall/item/7?ref=home', campaignKey:'Autumn 2026', ...extra,
});
const audits = env => env.DB.raw.prepare('SELECT action,job_id,actor FROM marketing_publication_audit ORDER BY id').all().map(r => ({ ...r }));

test('migration chain applies and adds studio tables plus nullable job columns', () => {
  const env = { DB:d1() };
  const tables = env.DB.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['marketing_content_variants','marketing_post_metrics','marketing_traffic_attributions']) assert.ok(tables.includes(t), t);
  const cols = env.DB.raw.prepare('PRAGMA table_info(marketing_publication_jobs)').all().map(r => r.name);
  assert.ok(cols.includes('variant_id') && cols.includes('tracking_code'));
  assert.ok(MIGRATION_FILES.includes('0206_marketing_content_studio.sql'));
});

test('buildTrackedLink appends UTM, keeps existing query and rejects unsafe links', () => {
  const link = new URL(buildTrackedLink('https://ekodi.kr/mall/item/7?ref=home&utm_source=old', { channel:'instagram', campaignKey:'Autumn 2026', trackingCode:'ekabc123' }));
  assert.equal(link.hostname, 'ekodi.kr');
  assert.equal(link.searchParams.get('ref'), 'home');
  assert.equal(link.searchParams.get('utm_source'), 'instagram');
  assert.equal(link.searchParams.get('utm_medium'), 'social');
  assert.equal(link.searchParams.get('utm_campaign'), 'autumn-2026');
  assert.equal(link.searchParams.get('utm_content'), 'ekabc123');
  assert.match(buildTrackedLink('https://link.coupang.com/a/xyz', { channel:'threads', campaignKey:'c', trackingCode:'ekzz9999' }), /utm_source=threads/);
  for (const bad of ['javascript:alert(1)', 'http://ekodi.kr/mall', 'https://evil.example.com/x', 'https://user:pw@ekodi.kr/', 'not a url']) {
    assert.throws(() => buildTrackedLink(bad, { channel:'instagram', campaignKey:'c', trackingCode:'ekabc123' }), { code:'TRACKED_LINK_REJECTED' }, bad);
  }
});

test('applyDisclosure puts the 추천·보증 notice at the very beginning exactly once', () => {
  const notice = '[광고] 제휴 링크 포함';
  assert.equal(applyDisclosure('본문입니다.', notice), `${notice}\n\n본문입니다.`);
  assert.equal(applyDisclosure(`${notice}\n\n본문입니다.`, notice), `${notice}\n\n본문입니다.`);
  assert.equal(applyDisclosure(`본문입니다.\n\n${notice}`, notice), `${notice}\n\n본문입니다.`);
  assert.equal(applyDisclosure('본문', ''), '본문');
  const caption = composeCaption({ body:'본문', disclosure_text:notice, hashtags_json:'["청계면","#에코디"]' });
  assert.ok(caption.startsWith(notice));
  assert.match(caption, /#청계면 #에코디$/);
});

test('state machine only allows approved variants to be scheduled', () => {
  assert.equal(nextVariantState('pending_review', 'approve'), 'approved');
  assert.equal(nextVariantState('pending_review', 'reject'), 'rejected');
  assert.equal(nextVariantState('approved', 'schedule'), 'scheduled');
  assert.equal(nextVariantState('pending_review', 'schedule'), null);
  assert.equal(nextVariantState('rejected', 'schedule'), null);
  assert.equal(nextVariantState('scheduled', 'approve'), null);
  assert.equal(channelAccepts('instagram', { provider:'meta', channel_type:'instagram_business' }), true);
  assert.equal(channelAccepts('instagram', { provider:'youtube', channel_type:'youtube_channel' }), false);
});

test('non-admin requests are blocked before any studio data is touched', async () => {
  const env = await seed();
  for (const [method, path] of [['GET','/variants'],['POST','/variants'],['POST','/variants/1/approve'],['POST','/variants/1/schedule']]) {
    const anon = await call(env, method, path, method === 'POST' ? {} : null, '');
    assert.equal(anon.status, 401, `${method} ${path}`);
    const forged = await call(env, method, path, method === 'POST' ? {} : null, 'not-a-real-session');
    assert.equal(forged.status, 401, `${method} ${path} forged`);
  }
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM marketing_content_variants').get().n, 0);
});

test('pending → approve → schedule creates exactly one job carrying the tracking code, with audit rows', async () => {
  const env = await seed();
  const created = await jsonOf(await createIg(env, { aiGenerated:true }));
  assert.equal(created.status, 201);
  const variant = created.body.variant;
  assert.equal(variant.status, 'pending_review');
  assert.equal(variant.aiGenerated, true);
  assert.match(variant.trackingCode, /^ek[a-z0-9]{6,}$/);
  assert.equal(new URL(variant.linkUrl).searchParams.get('utm_content'), variant.trackingCode);

  const early = await jsonOf(await call(env, 'POST', `/variants/${variant.id}/schedule`, { channelId:1 }));
  assert.equal(early.status, 409);
  assert.equal(early.body.error, 'VARIANT_NOT_APPROVED');

  const list = await jsonOf(await call(env, 'GET', '/variants?status=pending_review'));
  assert.equal(list.body.variants.length, 1);
  assert.equal(list.body.counts.pending_review, 1);

  const approved = await jsonOf(await call(env, 'POST', `/variants/${variant.id}/approve`, { note:'좋습니다' }));
  assert.equal(approved.body.variant.status, 'approved');
  assert.equal(approved.body.variant.reviewedBy, 'admin@example.org');

  const mismatch = await jsonOf(await call(env, 'POST', `/variants/${variant.id}/schedule`, { channelId:2 }));
  assert.equal(mismatch.body.error, 'CHANNEL_MISMATCH');

  const scheduledAt = new Date(Date.now() + 2 * 3600_000).toISOString();
  const first = await jsonOf(await call(env, 'POST', `/variants/${variant.id}/schedule`, { channelId:1, scheduledAt }));
  assert.equal(first.status, 200);
  assert.equal(first.body.idempotent, false);
  assert.equal(first.body.job.status, 'scheduled');
  assert.equal(first.body.variant.status, 'scheduled');
  const second = await jsonOf(await call(env, 'POST', `/variants/${variant.id}/schedule`, { channelId:1, scheduledAt }));
  assert.equal(second.body.idempotent, true);
  assert.equal(second.body.job.id, first.body.job.id);

  const jobs = env.DB.raw.prepare('SELECT * FROM marketing_publication_jobs').all();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].variant_id, variant.id);
  assert.equal(jobs[0].tracking_code, variant.trackingCode);
  assert.equal(jobs[0].status, 'scheduled');
  assert.equal(jobs[0].requested_by, 'human');
  const snapshot = env.DB.raw.prepare('SELECT * FROM marketing_content_items WHERE id=?').get(jobs[0].content_id);
  assert.equal(snapshot.approval_state, 'approved');
  assert.equal(snapshot.link_url, variant.linkUrl);
  assert.equal(snapshot.asset_url, 'https://ekodi.kr/assets/a.jpg');
  assert.equal(JSON.parse(snapshot.content_json).isAiGenerated, true);
  assert.match(snapshot.caption, /#청계면 #에코디$/);

  assert.deepEqual(audits(env).map(r => r.action), ['studio_variant_created','studio_variant_approved','studio_variant_scheduled']);
  assert.equal(audits(env)[2].job_id, jobs[0].id);
  assert.ok(audits(env).every(r => r.actor === 'admin@example.org'));
});

test('rejected variants can never create publication jobs', async () => {
  const env = await seed();
  const { body } = await jsonOf(await createIg(env));
  const rejected = await jsonOf(await call(env, 'POST', `/variants/${body.variant.id}/reject`, { note:'표현 수정 필요' }));
  assert.equal(rejected.body.variant.status, 'rejected');
  assert.equal(rejected.body.variant.reviewNote, '표현 수정 필요');
  const blocked = await jsonOf(await call(env, 'POST', `/variants/${body.variant.id}/schedule`, { channelId:1 }));
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error, 'VARIANT_NOT_APPROVED');
  const approveAfterReject = await jsonOf(await call(env, 'POST', `/variants/${body.variant.id}/approve`, {}));
  assert.equal(approveAfterReject.status, 409);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM marketing_publication_jobs').get().n, 0);
  assert.deepEqual(audits(env).map(r => r.action), ['studio_variant_created','studio_variant_rejected']);
});

test('affiliate links force a disclosure at the beginning of the stored body', async () => {
  const env = await seed();
  const { status, body } = await jsonOf(await createIg(env, { linkUrl:'https://link.coupang.com/a/abc', body:'이 제품 추천합니다.' }));
  assert.equal(status, 201);
  assert.equal(body.variant.disclosureText, DEFAULT_DISCLOSURE);
  assert.ok(body.variant.body.startsWith(DEFAULT_DISCLOSURE));
  const bad = await jsonOf(await createIg(env, { linkUrl:'javascript:alert(1)' }));
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'TRACKED_LINK_REJECTED');
});

test('existing plan gates still apply: no Marketing subscription means no job and the variant stays approved', async () => {
  const env = await seed({ plan:'' });
  const { body } = await jsonOf(await createIg(env));
  await call(env, 'POST', `/variants/${body.variant.id}/approve`, {});
  const gated = await jsonOf(await call(env, 'POST', `/variants/${body.variant.id}/schedule`, { channelId:1, scheduledAt:new Date(Date.now() + 3600_000).toISOString() }));
  assert.equal(gated.status, 409);
  assert.equal(gated.body.error, 'MARKETING_PLAN_SCHEDULE_REQUIRED');
  assert.equal(env.DB.raw.prepare('SELECT status FROM marketing_content_variants WHERE id=?').get(body.variant.id).status, 'approved');
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM marketing_publication_jobs').get().n, 0);
});

test('studio stays read-only when mutations are disabled', async () => {
  const env = await seed();
  env.ALLOW_MUTATIONS = 'false';
  const res = await createIg(env);
  assert.equal(res.status, 403);
});

test('admin Approvals tab hosts the studio review queue wired to the admin studio API', () => {
  const ui = fs.readFileSync(new URL('../marketing-ai-admin.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../marketing-ai-admin.css', import.meta.url), 'utf8');
  const control = fs.readFileSync(new URL('../marketing-admin-control.js', import.meta.url), 'utf8');
  assert.match(ui, /\/api\/marketing\/admin\/studio\/variants/);
  assert.match(ui, /status=pending_review/);
  assert.match(ui, /data-studio-action="approve"/);
  assert.match(ui, /data-studio-action="reject"/);
  assert.match(ui, /method:'POST'/);
  assert.match(ui, /추천·보증 표시/);
  assert.match(ui, /AI 생성/);
  assert.match(ui, /state\.tab === 'approvals'/);
  assert.match(css, /\.marketing-ai-studio-review/);
  assert.match(css, /@media\(max-width:560px\)\{\.marketing-ai-studio-counts/);
  assert.match(control, /handleContentStudio\(request, env, \{ resolveAdmin:adminSession/);
});
