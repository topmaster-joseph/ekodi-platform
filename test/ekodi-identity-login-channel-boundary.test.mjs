import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui = read('social-account-admin.js');
const menu = read('admin-menu-registry.js');
const channel = read('social-identity-control.js');
const login = read('auth-site/federated-login.js');
const router = read('auth-site/auth-router.js');
const identityApi = read('supabase/functions/identity-api/index.ts');
const authDoc = read('docs/AUTH-CENTER.md');
const boundaryDoc = read('docs/auth/EKODI-ID-LOGIN-CHANNEL-BOUNDARY.md');

test('EKODI one-person ID is distinct from social provider login and channel records', () => {
  assert.match(authDoc,/people\.ekodi_id/);
  assert.match(boundaryDoc,/login_identities/);
  assert.match(boundaryDoc,/identity_providers\.enabled/);
  assert.match(boundaryDoc,/ekodi_social_account_links/);
  assert.match(boundaryDoc,/이메일이라고 자동으로 같은 사람이라고 판단하지 않는다/);
  assert.match(login,/Every login path signs the person into ONE EKODI account/);
  assert.match(identityApi,/canonicalAccountSession/);
  assert.match(identityApi,/ensure_person_identity/);
});

test('external channel administration must not claim all EKODI social login is disabled', () => {
  assert.match(menu,/ko: '외부 채널 계정', en: 'External Channel Accounts'/);
  assert.match(ui,/<h2>외부 채널 계정 현황<\/h2>/);
  assert.match(ui,/회원 로그인\(Google·네이버·카카오\).*EKODI 통합 인증/);
  assert.match(ui,/채널 OAuth·자동게시: 비활성화/);
  assert.match(ui,/회원 로그인 정책은 별도/);
  assert.doesNotMatch(ui,/외부 소셜 로그인·OAuth·자동게시: 비활성화/);
  assert.match(channel,/socialLoginEnabled:false/);
  assert.match(channel,/No OAuth, account login, publishing, or token storage is enabled here/);
  assert.match(ui,/authenticatedSuperAdmin/);
  assert.doesNotMatch(ui,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
});

test('existing federated auth is independent, gated and no automatic account takeover', () => {
  assert.match(login,/renderLoginButtons/);
  assert.match(login,/renderLinkButtons/);
  assert.match(login,/redirectProviders/);
  assert.match(login,/purpose === 'link' \? `\/providers\/\$\{provider\.id\}\/link\/challenge`/);
  assert.match(login,/sessionStorage\.setItem\(PENDING_KEY/);
  assert.match(router,/site!=='admin'&&params\.get\('ekodi_email_action'\)!=='reset'\)federated\.renderLoginButtons\(\)/);
  assert.match(read('docs/auth/FEDERATED-LOGIN-NAVER-KAKAO.md'),/enabled=false/);
  assert.match(boundaryDoc,/외부 채널 계정 연결·게시 권한은 로그인 제공자 활성화와 독립적으로/);
});

test('external channel admin keeps existing selectors and route unchanged for compatible E2E', () => {
  for(const marker of [
    'data-social-search','data-social-filter','data-social-provider-card',
    'data-social-account-search','data-social-account-source','data-social-account-filter',
    'data-social-record','data-social-refresh','data-social-account-count'
  ]) assert.ok(ui.includes(marker),marker+' missing');
  assert.match(ui,/scope=all/);
  assert.match(menu,/sections: \['social-accounts'\]/);
});
