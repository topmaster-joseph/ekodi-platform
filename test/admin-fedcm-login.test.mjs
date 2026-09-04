import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminAuthUrl = new URL('../auth-site/admin-auth.js', import.meta.url);
const authRouterUrl = new URL('../auth-site/auth-router.js', import.meta.url);
const handoffUrl = new URL('../admin-central-handoff.js', import.meta.url);
const adminAuth = await readFile(adminAuthUrl, 'utf8');
const authRouter = await readFile(authRouterUrl, 'utf8');
const handoff = await readFile(handoffUrl, 'utf8');

test('admin Google auth modules remain syntactically valid', () => {
  for (const file of [adminAuthUrl, authRouterUrl, handoffUrl]) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
});

test('admin Google button enables FedCM only on supported browser versions', () => {
  assert.match(adminAuth, /function supportsFedCmButton\(\)/);
  assert.match(adminAuth, /isEmbeddedWebView\|\|isIos/);
  assert.match(adminAuth, /return isAndroid\?major>=128:major>=125/);
  assert.match(adminAuth, /use_fedcm_for_button:supportsFedCmButton\(\)/);
  assert.match(adminAuth, /button_auto_select:false/);
  assert.doesNotMatch(adminAuth, /use_fedcm_for_prompt/);
  assert.match(adminAuth, /disableAutoSelect/);
});

test('admin login opens central auth as a popup and hands the session back to the opener', () => {
  assert.match(handoff, /site=admin&direct=1&popup=1&return_to=/);
  assert.match(handoff, /window\.open\(target,AUTH_POPUP_NAME,popupFeatures\(\)\)/);
  assert.match(handoff, /event\.origin!==AUTH_ORIGIN\|\|event\.source!==authPopup/);
  assert.match(handoff, /payload\.type!=='ekodi-admin-auth-success'/);
  assert.ok(handoff.includes("if(!/^[a-f0-9]{64}$/i.test(value))return"));
  assert.match(adminAuth, /const popupEntry=params\.get\('popup'\)==='1'/);
  assert.match(adminAuth, /window\.opener\.postMessage\(\{type:'ekodi-admin-auth-success'/);
  assert.match(adminAuth, /new URL\(safeReturn\)\.origin/);
  assert.match(adminAuth, /window\.setTimeout\(\(\)=>window\.close\(\),80\)/);
});

test('single admin provider starts directly while multiple providers render a selector', () => {
  assert.match(adminAuth, /ADMIN_LOGIN_PROVIDERS=Object\.freeze/);
  assert.match(adminAuth, /id:'google',label:'Google',enabled:true,start:prepareGoogle/);
  assert.match(adminAuth, /if\(providers\.length===1\)return providers\[0\]\.start\(\)/);
  assert.match(adminAuth, /renderProviderChoice\(providers\)/);
  assert.match(adminAuth, /관리자 로그인 방식을 선택해 주세요/);
  assert.match(adminAuth, /window\.google\.accounts\.id\.prompt\(\)/);
  assert.match(adminAuth, /auto_select:false/);
});

test('admin auth recovers from expired challenges and shows allowlist failures clearly', () => {
  assert.match(adminAuth, /GOOGLE_ACCOUNT_NOT_ALLOWED/);
  assert.match(adminAuth, /expired_challenge/);
  assert.match(adminAuth, /setTimeout\(prepareGoogle,350\)/);
  assert.match(authRouter, /admin-auth\.js\?v=20260823-mobile-handoff-1/);
});