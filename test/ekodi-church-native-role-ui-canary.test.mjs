import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const src=await readFile(new URL('../scripts/ekodi-church-native-role-ui-canary.mjs',import.meta.url),'utf8');
const ci=await readFile(new URL('../.github/workflows/ekodi-native-church-role-ui-canary.yml',import.meta.url),'utf8');

test('the EKODI own native browser canary consumes public production UI, not an external remote desktop',()=>{
  assert.match(src,/import \{chromium\} from 'playwright'/);
  assert.match(src,/const PAGE=ORIGIN\+'\/ekodichurch\/'/);
  assert.match(src,/headless:true/);
  assert.match(src,/acceptDownloads:false/);
  assert.match(src,/serviceWorkers:'block'/);
  assert.match(src,/browser\.newContext\(/);
  assert.doesNotMatch(src,/DesktopCommander|TinyFish|Remote_Desktop/);
});
test('fixtures never reach Supabase and only worship capability route is simulated',()=>{
  assert.match(src,/page\.route\(url=>url\.origin===API_ORIGIN&&url\.pathname===API_PATH&&url\.searchParams\.get\('scope'\)==='worship-access'/);
  assert.match(src,/route\.fulfill\(/);
  assert.match(src,/const FAKE_TOKEN='ekodi-native-canary-fixture-not-a-user'/);
  assert.match(src,/if\(!\['GET','HEAD','OPTIONS'\]\.includes\(method\)\)/);
  assert.doesNotMatch(src,/service_role|sb_secret_|supabase_access_token|refresh_token|authorization:\s*['"]Bearer\s*eyJ/i);
});
test('real user authentication cannot be falsely claimed and role lifecycle is exercised',()=>{
  for(const stage of ['real production guest UI','in-browser synthetic server-authorized response','focus revalidation and DOM reuse','in-browser synthetic permission revocation','in-browser synthetic logout']){
    assert.ok(src.includes(stage),'missing stage '+stage);
  }
  assert.match(src,/realUserAuthenticated:false/);
  assert.match(src,/serverRoleResponsesSimulated:true/);
  assert.match(src,/assert\.equal\(intercepted,beforeLogout/);
  assert.match(src,/assert\.equal\(await admin\.count\(\),1/);
  assert.match(ci,/jq -e '.ok == true/);
  assert.match(ci,/permissions:\s+contents: read/);
  assert.doesNotMatch(ci,/secrets\.|environment:\s+production|service_role/);
});

test('first-party Chromium checks dated worship on PC and mobile without making writes',()=>{
  assert.match(src,/for\(const device of \[\{name:'mobile',width:390,height:844\},\{name:'desktop',width:1440,height:900\}\]\)/);
  assert.match(src,/await picker\.selectOption\(entry\.date\)/);
  assert.match(src,/guestEditHidden:root\.querySelector/);
  assert.match(src,/state\.stage,state\.bulletin\+'\?view=stage'/);
  assert.match(src,/state\.operator,state\.bulletin\+'\?view=operator'/);
  assert.match(src,/state\.rootRight<=state\.width\+2/);
  assert.match(src,/release\.sourceSha,/);
  assert.match(src,/releaseSourceSha:release\.sourceSha/);
  assert.match(src,/if\(!\['GET','HEAD','OPTIONS'\]\.includes\(method\)\)/);
});
