import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Stub the Workers runtime module so the real worker code runs under node:test.
const hooks = `export async function resolve(spec, ctx, next) {
  if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class WorkerEntrypoint { constructor(c,e){ this.ctx=c; this.env=e; } }', shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hooks));
const { default: worker } = await import('../marketing-growth-worker.js');

// D1 stub: no state row exists (Meta error redirects carry no state).
const db = { prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({}) }) }) };
const env = { DB: db, META_APP_ID: '1103899225707957', META_APP_SECRET: 'x', THREADS_APP_ID: '4045368342266279' };
const call = path => worker.fetch(new Request(`https://ekodi.kr${path}`), env);
const notice = res => {
  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, 'https://ekodi.kr/admin/services/marketing-ai');
  assert.equal(loc.searchParams.get('ekodi_connect'), 'error');
  return loc.searchParams;
};

test('Meta app-domain error (1349048) returns to admin with Korean fix and app id', async () => {
  const p = notice(await call('/oauth/meta/callback?error_code=1349048&error_message=URL'));
  assert.equal(p.get('provider'), 'meta');
  assert.match(p.get('reason'), /앱 도메인 ekodi\.kr/);
  assert.match(p.get('reason'), /1103899225707957/);
});

test('user cancel maps to friendly retry message', async () => {
  const p = notice(await call('/oauth/meta/callback?error=access_denied&error_code=200'));
  assert.match(p.get('reason'), /취소/);
});

test('expired or reused state without provider error asks to restart, never raw text', async () => {
  const res = await call('/oauth/meta/callback?state=stale&code=abc');
  const p = notice(res);
  assert.match(p.get('reason'), /10분/);
});

test('Threads callback uses Threads app id', async () => {
  const p = notice(await call('/oauth/threads/callback?error_code=1349048'));
  assert.equal(p.get('provider'), 'threads');
  assert.match(p.get('reason'), /4045368342266279/);
});

test('reason is length-bounded and host is fixed (no open redirect)', async () => {
  const long = 'A'.repeat(5000);
  const p = notice(await call(`/oauth/meta/callback?error_code=999&error_message=${long}&return_url=https://evil.example`));
  assert.ok(p.get('reason').length <= 300);
});

test('Meta publish login requests business_management and re-shows the page picker', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../marketing-growth-worker.js', import.meta.url), 'utf8');
  assert.match(src, /'instagram_content_publish','business_management'\];/);
  assert.match(src, /searchParams\.set\('auth_type','rerequest'\)/);
  assert.match(src, /metaPagesWithBusinessFallback\(env,userToken,pagesData\.data/);
  assert.match(src, /owned_pages\.limit\(100\)/);
  assert.match(src, /기존 설정 편집/);
});

test('platform marketing console connects channels to the ekodimall autopost subject', async () => {
  const { readFile } = await import('node:fs/promises');
  const [ui, engine] = await Promise.all([
    readFile(new URL('../marketing-ai-channel-manager.js', import.meta.url), 'utf8'),
    readFile(new URL('../mall-promotion-automation.js', import.meta.url), 'utf8'),
  ]);
  assert.match(ui, /searchParams\.set\('subject_type','tenant'\)/);
  assert.match(ui, /searchParams\.set\('subject_key','ekodimall'\)/);
  assert.doesNotMatch(ui, /searchParams\.set\('subject_type','person'\)/);
  assert.match(engine, /const SUBJECT_KEY = 'ekodimall';/);
});
