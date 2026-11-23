import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { saveGoogleSecret, storedGoogleSecretStatus, withStoredGoogleSecret, clearGoogleSecret, resetGoogleSecretCacheForTests, GOOGLE_SECRET_PATTERN } from '../mail-google-secret-store.js';
import { googleMailConfigured } from '../mail-google-adapter.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  const wrap = (sql) => { const st = () => db.prepare(sql); return { bind: (...a) => ({ run: async () => st().run(...a), first: async () => st().get(...a) ?? null, all: async () => ({ results: st().all(...a) }) }), run: async () => st().run(), first: async () => st().get() ?? null }; };
  return { raw: db, prepare: wrap };
}
const SECRET = 'GOCSPX-' + 'Ab12Cd34Ef56Gh78Ij90KlMn';

test('stores the Google client secret encrypted and exposes it only through the env override', async () => {
  resetGoogleSecretCacheForTests();
  const DB = d1();
  const env = { DB, MAIL_CREDENTIAL_KEY: 'k'.repeat(64), GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com' };
  assert.equal(googleMailConfigured(env), false);
  assert.deepEqual(await storedGoogleSecretStatus(env), { configured: false, source: 'none' });
  const saved = await saveGoogleSecret(env, SECRET, 'topmaster.joseph@gmail.com');
  assert.equal(saved.configured, true); assert.equal(JSON.stringify(saved).includes(SECRET), false);
  const row = DB.raw.prepare('SELECT * FROM mail_platform_settings').get();
  assert.equal(JSON.stringify(row).includes(SECRET), false, 'never stored in plaintext');
  const live = await withStoredGoogleSecret(env);
  assert.equal(live.MAIL_GOOGLE_CLIENT_SECRET, SECRET);
  assert.equal(live.DB, DB, 'bindings stay reachable');
  assert.equal(googleMailConfigured(live), true);
  assert.equal(Object.keys(live).includes('MAIL_GOOGLE_CLIENT_SECRET'), false, 'not enumerable');
  const st = await storedGoogleSecretStatus(env);
  assert.equal(st.source, 'stored'); assert.equal(JSON.stringify(st).includes(SECRET), false);
  await clearGoogleSecret(env);
  assert.equal((await withStoredGoogleSecret(env)).MAIL_GOOGLE_CLIENT_SECRET, undefined);
});

test('a Worker secret wins and malformed values are rejected', async () => {
  resetGoogleSecretCacheForTests();
  const env = { DB: d1(), MAIL_CREDENTIAL_KEY: 'k'.repeat(64), MAIL_GOOGLE_CLIENT_SECRET: 'GOCSPX-fromworkersecret12345' };
  assert.equal(await withStoredGoogleSecret(env), env);
  assert.equal((await storedGoogleSecretStatus(env)).source, 'worker-secret');
  for (const bad of ['', 'abc', 'GOCSPX-short', 'GOCSPX-' + 'a'.repeat(20) + ' x', '<script>']) {
    assert.equal(GOOGLE_SECRET_PATTERN.test(bad), false, bad);
    await assert.rejects(saveGoogleSecret({ ...env, MAIL_GOOGLE_CLIENT_SECRET: '' }, bad, 'x'), /INVALID|형식/);
  }
});

test('setup API is operator-only, never echoes the secret, and the admin page offers the mobile steps', () => {
  const mail = readFileSync(new URL('../mail-control.js', import.meta.url), 'utf8');
  assert.match(mail, /url\.pathname==='\/api\/mail\/control\/google-oauth-setup'/);
  assert.match(mail, /if\(!isOperator\)return json\(\{error:'운영자 계정만 설정할 수 있습니다\.',code:'OPERATOR_ONLY'\},403,request\)/);
  assert.match(mail, /env = await withStoredGoogleSecret\(env\);\n\n  \/\/ EKODI-MAIL-GOOGLE-SECRET-MOBILE-001/);
  assert.match(mail, /export async function googleAccessForAccount\(env, db, account\)\{\n  env = await withStoredGoogleSecret\(env\);/);
  const page = readFileSync(new URL('../mail-admin-page.js', import.meta.url), 'utf8');
  assert.match(page, /id="gSetup" hidden/);
  assert.match(page, /id="gSecret" type="password" autocomplete="off"/);
  assert.match(page, /\$\('gSecret'\)\.value='';/);
  assert.match(page, /gmail\.googleapis\.com\?project=ekodi-platform/);
});

test('secret input uses the explicit light input style (not the dark shell theme)', () => {
  const page = readFileSync(new URL('../mail-admin-page.js', import.meta.url), 'utf8');
  assert.match(page, /\.ma input\[type=password\]\{[^}]*background:#fff!important/);
});
