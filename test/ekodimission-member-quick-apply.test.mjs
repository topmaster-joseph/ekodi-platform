import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Mission quick application reuses existing authenticated self-profile and minimal contact projection',async()=>{
  const shell=await read('space/ekodimission-shell.js');
  assert.match(shell,/async function missionApplicationContact\(\)/);
  assert.match(shell,/getSelf\('get_my_public_profile'\)/);
  assert.match(shell,/getSelf\('get_my_identity_share_config'\)/);
  assert.match(shell,/accessToken=verifiedToken/);
  assert.match(shell,/if\(!verifiedToken\|\|verifiedToken!==accessToken\)/);
  assert.match(shell,/return Object\.freeze\(\{[\s\S]*?name:[\s\S]*?phone:[\s\S]*?email:/);
  assert.match(shell,/applicationContact:missionApplicationContact/);
  assert.doesNotMatch(shell.slice(shell.indexOf('async function missionApplicationContact()'),shell.indexOf('window.EKODIMissionAuth=')),/localStorage\.setItem|sessionStorage\.setItem/);
});

test('Quick application requires event-specific privacy consent, open event, current member session',async()=>{
  const source=await read('space/ekodimission.js');
  assert.match(source,/if\(!consent\?\.checked\)/);
  assert.match(source,/quickRegistrationOpen=Boolean\(data\?\.ok&&data\.registration_open===true\)/);
  assert.match(source,/if\(!ready\.ok\|\|gate\?\.registration_open!==true\)/);
  assert.match(source,/auth\.getToken\(\)!==accessToken/);
  assert.match(source,/if\(submit\.disabled\|\|applicationCompleted\|\|status\.dataset\.state==='closed'\)/);
  assert.match(source,/form\.requestSubmit\(submit\)/);
  assert.match(source,/if\(!response\.ok\|\|!result\.ok\|\|!result\.applicationId\)/);
  assert.doesNotMatch(source,/localStorage\.setItem\([^)]*?(?:name|phone|email)|sessionStorage\.setItem\([^)]*?(?:name|phone|email)/);
});

test('Guest application and per-event consent manual form remain intact',async()=>{
  const source=await read('space/ekodimission.js'),css=await read('space/ekodimission.css');
  const open=await read('space/ekodimission-open-table-apply.page'),trip=await read('space/ekodimission-autumn-trip-apply.page');
  for(const page of [open,trip]){
    assert.match(page,/data-event-application/);
    assert.match(page,/name="privacyConsent" required/);
    assert.match(page,/name="phone"/);
    assert.match(page,/name="name"/);
  }
  assert.match(source,/quick\.hidden=!window\.EKODIMissionAuth\?\.getToken/);
  assert.match(source,/status\.dataset\.state='closed'/);
  assert.match(source,/submit\.disabled=true/);
  assert.match(css,/\.mission-quick-apply\[hidden\]\{display:none!important\}/);
});
