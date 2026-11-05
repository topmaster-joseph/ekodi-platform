import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('mission home offers precisely one guest login-to-join action outside the private form',async()=>{
  const html=await source('space/ekodimission.page');
  assert.equal((html.match(/data-mission-saturday-login/g)||[]).length,1);
  assert.match(html,/<form class="mission-saturday-form" data-mission-saturday-form hidden>/);
  assert.match(html,/<a\b[^>]*data-mission-saturday-login[^>]*>로그인 후 참여하기<\/a>/);
  const form=html.match(/<form class="mission-saturday-form"[\s\S]*?<\/form>/)?.[0]||'';
  assert.ok(form.length>0);
  assert.doesNotMatch(form,/data-mission-saturday-login|에코디 로그인|로그인 후 참여/);
  assert.match(form,/참여 신청 등록·수정/);
});

test('Saturday RSVP defers form to authenticated state and uses canonical login return',async()=>{
  const js=await source('space/ekodimission-saturday.js');
  assert.match(js,/form\.hidden=!authenticated/);
  assert.match(js,/login\.hidden=authenticated\|\|data\.meeting\.status!=='scheduled'/);
  assert.match(js,/returnTo\.hash='#saturday'/);
  assert.match(js,/login\.href='\/auth\/\?site=mission&return_to='/);
  assert.match(js,/if\(!bearer\)\{[\s\S]{0,160}form\.hidden=true/);
  const recurring=await source('space/ekodimission-participation.js');
  assert.match(recurring,/const hasPrimaryLogin=Boolean/);
  assert.match(recurring,/login\.hidden=hasPrimaryLogin/);
});

test('mission header provides identity next to logout and responds to mobile width',async()=>{
  const shell=await source('space/ekodimission-shell.js');
  const css=await source('space/ekodimission-shell.css');
  const siteCss=await source('space/ekodimission.css');
  assert.match(shell,/const accountId=authenticated\?missionAccountLabel\(account\):''/);
  assert.match(shell,/missionAuthUi\.state\.textContent=accountId/);
  assert.match(shell,/mission-auth-logout/);
  assert.match(shell,/missionAuthUi\?\.logout\.addEventListener\('click'/);
  assert.match(css,/MISSION-MOBILE-HEADER-20261105/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto auto/);
  assert.match(siteCss,/MISSION-RSVP-AUTH-20261105/);
  assert.match(siteCss,/@media\(max-width:980px\)/);
  assert.match(siteCss,/\.mission-saturday-form\[hidden\]/);
});
