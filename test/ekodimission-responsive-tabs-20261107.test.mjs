import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('home and activity navigation retain keyboard-accessible tabs with URL restoration',async()=>{
  const [home,activities,site]=await Promise.all([
    read('space/ekodimission.page'),
    read('space/ekodimission-activities.page'),
    read('space/ekodimission.js')
  ]);
  const homeTabs=['saturday','notices','schedule'];
  const activityTabs=['saturday','join','partners','news','qtin'];
  for(const tab of homeTabs){
    assert.match(home,new RegExp('data-mission-tab="'+tab+'"'));
    assert.match(home,new RegExp('data-mission-tab-panel="'+tab+'"'));
  }
  for(const tab of activityTabs){
    assert.match(activities,new RegExp('data-mission-tab="'+tab+'"'));
    assert.match(activities,new RegExp('data-mission-tab-panel="'+tab+'"'));
  }
  assert.match(home,/id="mission-next-event">이번 주 토요모임<\/h2>/);
  assert.match(home,/id="mission-updates"/);
  assert.match(site,/function mountMissionContentTabs\(/);
  assert.match(site,/window\.addEventListener\('hashchange',sync\)/);
  assert.match(site,/window\.addEventListener\('popstate',sync\)/);
  assert.match(site,/event\.key==='ArrowRight'/);
  assert.match(site,/panel\.hidden=panel\.dataset\.missionTabPanel!==selected/);
  assert.match(site,/location\.hash=selected/);
});

test('Saturday public roster contains only consented names grouped by explicit public reply state',async()=>{
  const [html,saturday,participation]=await Promise.all([
    read('space/ekodimission.page'),
    read('space/ekodimission-saturday.js'),
    read('space/ekodimission-participation.js')
  ]);
  for(const kind of ['join','cancel']){
    assert.match(html,new RegExp('data-mission-attendance-tab="'+kind+'"'));
    assert.match(html,new RegExp('data-mission-attendance-panel="'+kind+'"'));
  }
  const publicRender=saturday.slice(saturday.indexOf('function renderReplies(items){'),saturday.indexOf('function mountAttendanceTabs(){'));
  assert.match(publicRender,/item\.attendance===kind/);
  assert.match(publicRender,/row\.textContent=item\.displayName\.trim\(\)/);
  assert.doesNotMatch(publicRender,/reply\.body|item\.body|createdAt|date\.textContent|innerHTML|privateRsvp/);
  assert.match(html,/개인 정기참여·비공개 참석 여부는 공개하지 않습니다/);
  assert.match(saturday,/function mountAttendanceTabs\(/);
  assert.match(participation,/const hasPrimaryLogin=Boolean/);
});

test('guests have one login CTA outside form; members use existing session and logout controls',async()=>{
  const [home,saturday,shell]=await Promise.all([
    read('space/ekodimission.page'),
    read('space/ekodimission-saturday.js'),
    read('space/ekodimission-shell.js')
  ]);
  assert.equal((home.match(/data-mission-saturday-login/g)||[]).length,1);
  assert.match(home,/<form class="mission-saturday-form" data-mission-saturday-form hidden>/);
  assert.match(home,/<a\b[^>]*data-mission-saturday-login[^>]*>로그인 후 참여하기<\/a>/);
  const form=home.match(/<form class="mission-saturday-form"[\s\S]*?<\/form>/)?.[0]||'';
  assert.doesNotMatch(form,/data-mission-saturday-login|에코디 로그인/);
  assert.match(saturday,/form\.hidden=!authenticated/);
  assert.match(saturday,/login\.hidden=authenticated\|\|data\.meeting\.status!=='scheduled'/);
  assert.match(saturday,/destination\.hash='#saturday'/);
  assert.match(shell,/missionAuthUi\.state\.textContent=authenticated\?missionAccountLabel\(account\):''/);
  assert.ok(shell.includes("missionAuthUi.state.title=authenticated?'로그인 아이디: '"));
  assert.match(shell,/missionAuthUi\?\.logout\.addEventListener\('click'/);
});

test('mobile/desktop design bounds headline, date and tabs without clipping',async()=>{
  const [css,shell]=await Promise.all([
    read('space/ekodimission.css'),
    read('space/ekodimission-shell.css')
  ]);
  assert.match(css,/mission-home \.hero h1\{[\s\S]*?font-size:clamp\(1\.95rem,3\.25vw,3\.25rem\)!important/);
  assert.match(css,/mission-home-current \.mission-saturday-date strong\{[\s\S]*?white-space:normal!important/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/mission-activity-hub \.mission-content-tabs\{flex-wrap:wrap/);
  assert.match(css,/\[data-mission-tab-panel\]\[hidden\]/);
  assert.match(shell,/grid-template-columns:minmax\(0,1fr\) auto auto/);
});
