import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const html=read('my/points/index.html'),app=read('my/points/app.js'),css=read('my/points/styles.css');
test('referral flow is user initiated, tied to My site, and default hidden',()=>{
  assert.match(html,/id="referralSection" hidden/);
  assert.match(html,/id="referralConfirmSection" hidden/);
  assert.match(app,/enabled&&authorized===true&&site==='my'/);
  assert.match(app,/\.addEventListener\('click',issueReferralInvite\)/);
  assert.match(app,/\.addEventListener\('click',confirmReferralInvite\)/);
  assert.match(app,/\.rpc\('ekodi_points_issue_share_invite',\{p_site:'my'\}\)/);
  assert.match(app,/\.rpc\('ekodi_points_confirm_shared_signup',\{p_code:inviteCode\}\)/);
  assert.doesNotMatch(app,/confirmReferralInvite\(\);/);
});
test('new-member invites never credit based only on link creation/copy',()=>{
  assert.match(app,/공유만으로 포인트는 적립되지 않습니다/);
  assert.match(app,/data\?\.confirmed===true/);
  assert.match(app,/url\.searchParams\.delete\('invite'\)/);
  assert.match(app,/window\.history\.replaceState/);
  assert.match(app,/uuidPattern\.test\(inviteCode\)/);
  assert.match(css,/\.invite-panel\[hidden\]/);
});
