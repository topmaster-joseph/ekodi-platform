import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const browser=source('scripts/verify-points-staging-browser.mjs');
const app=source('my/points/app.js');
const workflow=source('.github/workflows/verify-points-staging-browser.yml');

function ordered(a,b,label){
  const first=browser.indexOf(a),second=browser.indexOf(b);
  assert.ok(first>=0,label+' first action must exist');
  assert.ok(second>first,label+' actions are out of order');
}

test('member E2E switches to visible activity tab before waiting for claim controls',()=>{
  ordered("{type:'click',selector:'#pointsTabClaims'}","{type:'waitFor',selector:'#claimSection:not([hidden])'","claim tab");
  ordered("{type:'click',selector:'#pointsTabProgress'}","{type:'waitFor',selector:'#pointsProgressContent:not([hidden])'","progress tab");
  assert.match(browser,/selector:'#pointsWeeklySection:not\(\[hidden\]\)'/);
  assert.match(browser,/selector:'#pointsGoalSection:not\(\[hidden\]\)'/);
  assert.match(browser,/text:'이번 주 검증된 참여'/);
  assert.match(browser,/text:'나의 성취 목표'/);
});

test('pending submission is projected by server after the claim and verified in E2E',()=>{
  ordered("{type:'click',selector:'#claimSubmit'}","{type:'assertText',text:'승인 대기'}","pending claim");
  const submit=browser.indexOf("{type:'click',selector:'#claimSubmit'}");
  assert.ok(submit>=0,'submit action missing');
  assert.ok(browser.indexOf("{type:'click',selector:'#pointsTabProgress'}",submit)>submit,'progress tab not revisited after claim');
  assert.match(browser,/selector:'#pointsMissionList \.record strong:has-text\("승인 대기"\)'/);
  assert.match(app,/await loadClaims\(site,revision\);[\s\S]{0,450}void loadProgress\(session\.access_token,site,revision\)/);
  assert.match(app,/revision===viewRevision&&select\.value===site&&session\?\.access_token/);
  assert.doesNotMatch(app,/award_evidence|points_admin_decide/);
});

test('development E2E remains ephemeral and cannot target production',()=>{
  assert.match(workflow,/environment: development/);
  assert.match(workflow,/DEV_REF: lxcxwbdwwojjkgybbqii/);
  assert.match(workflow,/name: Revoke ephemeral session, member and fixtures\n\s+if: always\(\)/);
  assert.match(browser,/POINTS_E2E_MEMBER_HASH_DESKTOP/);
  assert.match(browser,/\['desktop','desktop'\],\['mobile','mobile-portrait'\]/);
  assert.doesNotMatch(workflow,/renzehysxirjilvdxacv/);
});

test('fresh synthetic Points wallet and pending claim never expose a CSV download control',()=>{
  const first=browser.indexOf("{type:'waitFor',selector:'#balanceView:not([hidden])'");
  const hidden=browser.indexOf("{type:'assertHidden',selector:'#exportPointsHistory'}");
  const disabled=browser.indexOf("{type:'assertDisabled',selector:'#exportPointsHistory'}");
  const claim=browser.indexOf("{type:'click',selector:'#claimSubmit'}");
  const wallet=browser.indexOf("{type:'click',selector:'#pointsTabWallet'}");
  const lastHidden=browser.lastIndexOf("{type:'assertHidden',selector:'#exportPointsHistory'}");
  const noHistory=browser.lastIndexOf("{type:'assertText',text:'아직 거래 내역이 없습니다.'}");
  assert.ok(first>=0&&first<hidden&&hidden<disabled&&disabled<claim);
  assert.ok(claim<wallet&&wallet<lastHidden&&lastHidden<noHistory);
  assert.equal((browser.split("{type:'assertHidden',selector:'#exportPointsHistory'}").length-1),2);
  assert.equal((browser.split("{type:'assertDisabled',selector:'#exportPointsHistory'}").length-1),2);
  assert.match(app,/if\(!Array\.isArray\(rows\)\|\|!rows\.length\)\{historyList\.textContent='아직 거래 내역이 없습니다.'/);
  assert.match(app,/if\(!enabled\|\|!ownerId\|\|!Array\.isArray\(rows\)\|\|!rows\.length\)return;/);
  const actions=browser.split("if(target==='member'){")[1].split("}else{")[0].match(/\{type:'/g)||[];
  assert.ok(actions.length<=30,'EKODI browser runner caps tasks at 30 actions');
  assert.match(source('scripts/ekodi-background-browser-worker.mjs'),/BROWSER_ASSERT_CONTROL_MISSING/);
  assert.match(source('scripts/ekodi-background-browser-worker.mjs'),/BROWSER_ASSERT_CONTROL_STATE_FAILED/);
});
