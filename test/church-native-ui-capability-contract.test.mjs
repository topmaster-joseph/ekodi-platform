import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('native Church browser uses the live site and tests the exact UI capability lifecycle without real credentials',async()=>{
  const s=await read('scripts/verify-church-live-ui-with-synthetic-session.mjs');
  assert.match(s,/https:\/\/ekodi\.kr\/ekodichurch\//);
  assert.match(s,/chromium\.launch\(\{headless:true\}\)/);
  assert.match(s,/\/functions\/v1\/church-pastor-api/);
  assert.match(s,/scope'\)===\x27worship-access\x27/);
  assert.match(s,/route\.fulfill\(/);
  assert.match(s,/route\.abort\('blockedbyclient'\)/);
  assert.match(s,/guest-hidden-on-real-site/);
  assert.match(s,/mocked-allowed-capability-shows-control/);
  assert.match(s,/mocked-revocation-hides-control/);
  assert.match(s,/logout-hides-control/);
  assert.match(s,/This does not prove|no real Google admin bearer/);
  assert.doesNotMatch(s,/sb_secret_|service_role|SUPABASE_ACCESS_TOKEN/);
});
test('isolated proof workflow is restricted to read-only repository and no credential-bearing environment',async()=>{
  const w=await read('.github/workflows/verify-church-native-ui-capability.yml');
  assert.match(w,/permissions:\s+contents: read/);
  assert.match(w,/npx playwright install --with-deps chromium/);
  assert.match(w,/scripts\/verify-church-live-ui-with-synthetic-session\.mjs/);
  assert.match(w,/artifacts\/church-worship-ui\/evidence\.json/);
  assert.doesNotMatch(w,/environment: production|secrets\.|SUPABASE_SERVICE_ROLE_KEY/);
});
