import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const router = fs.readFileSync(new URL('../auth-site/auth-router.js', import.meta.url), 'utf8');
const hub = fs.readFileSync(new URL('../auth-site/auth.js', import.meta.url), 'utf8');

test('manage=1 opens the identity panel (Kakao/Naver 계정 추가) instead of the portal fast path', () => {
  const branch = router.split("\n").find(line => line.includes("isRegistryUserService||") && line.includes("loadClientAuth")) || "";
  assert.match(branch, /!manageMode/, 'portal/registry fast path must exclude manage=1');
  assert.match(hub, /renderLinkButtons\(data\.identities\|\|\[\]\)/, 'auth.js renders the provider link buttons');
  assert.match(hub, /manageMode&&site==='portal'/, 'auth.js has the portal account-management view');
});
