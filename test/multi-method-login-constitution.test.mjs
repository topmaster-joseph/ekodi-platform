// Constitution 3A-1 (v1.27.8): every user-facing EKODI login offers every enabled method through
// /auth/, resolves to one EKODI ID, never collects provider passwords and never auto-launches a
// single provider. Site-local provider-only login UIs are a frozen, shrink-only legacy baseline.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = p => fs.readFileSync(p, 'utf8');
const constitution = JSON.parse(read('governance/constitution/constitution.json').replace(/^﻿/, ''));
const policy = constitution.multiMethodLoginPolicy;

const SKIP_DIRS = new Set(['.git', 'node_modules', 'test', 'tests', 'auth-site', 'scripts', 'vendor', 'dist', 'artifacts', 'docs', 'governance', 'prototypes', '.github']);
const PROVIDER_WIDGET = /accounts\.google\.com\/gsi\/client|google\.accounts\.id\.(?:renderButton|initialize)\s*\(/;
function scan(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) scan(path.join(dir, entry.name), out); continue; }
    if (!/\.(?:m?js|html)$/.test(entry.name) || /\.(?:test|spec)\.m?js$/.test(entry.name)) continue;
    const file = path.join(dir, entry.name).replaceAll('\\', '/').replace(/^\.\//, '');
    if (PROVIDER_WIDGET.test(read(file))) out.push(file);
  }
  return out;
}

test('3A-1 is versioned in the constitution, its JSON policy and an approved owner amendment', () => {
  assert.equal(constitution.version, '1.27.10');
  assert.ok(constitution.principles.includes('multi-method-login-one-ekodi-id'));
  assert.equal(policy.canonicalEntry, 'https://ekodi.kr/auth/');
  assert.equal(policy.emailPassword.providerPasswordCollectionForbidden, true);
  assert.equal(policy.autoLaunch.userFacing, 'forbidden');
  assert.equal(policy.legacyShrinkOnly, true);
  const doc = read('CONSTITUTION.md');
  assert.match(doc, /^# EKODI Platform Constitution v1\.27\.10/m);
  assert.match(doc, /## 3A-1\. Multi-Method EKODI Login Constitution/);
  const amendment = JSON.parse(read('governance/amendments/2026-11-10-multi-method-login-v1.27.8.json'));
  assert.equal(amendment.status, 'approved');
  assert.equal(amendment.constitutionVersion, '1.27.8');
  assert.equal(amendment.approvalScope.paymentFlowChangesAuthorized, false);
});

test('no new site-local provider-only login UI; the legacy baseline may only shrink', () => {
  const found = scan('.').sort();
  const legacy = new Set(policy.legacySiteLocalProviderLogin);
  const unexpected = found.filter(file => !legacy.has(file));
  assert.deepEqual(unexpected, [], `site-local provider login outside /auth/ is forbidden (3A-1): ${unexpected.join(', ')}`);
  const stale = [...legacy].filter(file => !found.includes(file));
  assert.deepEqual(stale, [], `remove migrated files from multiMethodLoginPolicy.legacySiteLocalProviderLogin: ${stale.join(', ')}`);
});

test('the canonical /auth/ surface renders every enabled method for every non-admin site', () => {
  const router = read('auth-site/auth-router.js');
  assert.match(router, /if\(!federatedHandled&&federated&&site!=='admin'&&params\.get\('ekodi_email_action'\)!=='reset'\)federated\.renderLoginButtons\(\)/);
  assert.match(router, /if\(!federatedHandled&&site!=='admin'&&params\.get\('ekodi_email_action'\)!=='reset'\)\{\s*import\('\.\/email-password\.js[^']*'\)\.then\(m=>m\.mountEmailPassword\(\)\)/);
  const page = read('auth-site/index.html');
  assert.match(page, /id="googleButtonHost"/);
  assert.match(page, /id="federatedButtonHost"/);
});

test('user-facing direct=1 shows the method choice; the Google chooser auto-opens only for admin paths', () => {
  const auth = read('auth-site/client-auth.js');
  assert.match(auth, /const ADMIN_DIRECT_TARGET=\(\(\)=>\{try\{return \/\\\/admin\(\?:\\\/\|\$\)\/\.test\(new URL\(RETURN_TO\)\.pathname\)\}catch\{return false\}\}\)\(\);/);
  assert.match(auth, /if\(DIRECT_LOGIN&&!ADMIN_DIRECT_TARGET\)\{\s*notice\('사용하실 로그인 방식을 선택해 주세요/);
});

test('auth notices never present Google as the only way in', () => {
  for (const file of ['auth-site/client-auth.js', 'auth-site/business-auth.js']) {
    const src = read(file);
    assert.doesNotMatch(src, /처음 한 번만 Google 계정으로 본인을 확인합니다|아래 Google 버튼을 눌러/, file);
  }
});

test('account switching re-renders every enabled login method', () => {
  assert.match(read('auth-site/client-auth.js'), /window\.dispatchEvent\(new CustomEvent\('ekodi:auth-signed-out'\)\)/);
  assert.match(read('auth-site/auth-router.js'), /addEventListener\('ekodi:auth-signed-out',\(\)=>federated\.renderLoginButtons\(\)/);
  const ui = read('auth-site/email-password.js');
  assert.match(ui, /가입에 사용할 이메일 \(에코디 아이디\)/);
  assert.match(ui, /가입에 사용할 에코디 비밀번호 \(12자 이상\)/);
});

test('email + password is an EKODI-only credential gated by all three operator switches', () => {
  const ui = read('auth-site/email-password.js');
  assert.match(ui, /구글·네이버·카카오 비밀번호가 아니라, 에코디에서만 쓸 새 비밀번호/);
  assert.match(ui, /구글 계정 비밀번호는 입력하지 마세요/);
  assert.match(ui, /if\(readiness\.enabled!==true\)return false;/);
  const api = read('supabase/functions/identity-api/index.ts');
  for (const flag of policy.methodSource.emailPassword) assert.ok(api.includes(`Deno.env.get("${flag}")==="true"`), flag);
});

test('cooperative logins open the multi-method /auth/ choice instead of a Google-only shortcut', () => {
  const coop = read('cooperative-ui.js');
  const fn = coop.slice(coop.indexOf('function loginUrl()'), coop.indexOf('async function authRequest'));
  assert.match(fn, /url\.searchParams\.set\('site', 'coop'\)/);
  assert.doesNotMatch(fn, /'direct'/);
  const page = read('cooperative-page.js');
  assert.doesNotMatch(page, /Google로 로그인|Google 계정으로 로그인/, 'user-facing login labels must not name a single provider');
});
