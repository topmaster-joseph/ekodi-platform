import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceAdminPage, workspaceAdminCss, workspaceAdminScript } from '../workspace-admin-page.js';

test('workspace admin uses direct left navigation and opens leaf sections in the right workbench',async()=>{
  const [html,css,script]=await Promise.all([
    workspaceAdminPage().text(),
    workspaceAdminCss().text(),
    workspaceAdminScript().text(),
  ]);
  assert.match(html,/data-ekodi-admin-layout="direct-left"/);
  assert.match(html,/data-ekodi-admin-nav-mode="direct"/);
  assert.match(html,/id="sectionNav"[^>]*data-ekodi-admin-subnav[^>]*hidden/);
  assert.match(html,/운영공간 확인 중/);
  assert.doesNotMatch(html,/tenant-admin-command-home/);
  assert.match(html,/관리자 인증과 운영공간 권한을 확인하고 있습니다/);
  assert.match(css,/\.topbar\{display:none/);
  assert.match(css,/\.sidebar\{position:sticky;top:0;height:100dvh/);
  assert.match(css,/\.sidebar nav\{[^}]*overflow-y:auto[^}]*flex:1 1 auto/);
  assert.match(css,/\.admin-subnav\{display:none!important\}/);
  for(const label of ['운영 홈','메일','지급·수령 확인','업무','재무','헤더 · 푸터','디자인','다국어 번역 · 게시','사용자 · 권한','행사 · 신청자','채널·자동게시','마케팅 AI','운영 상태','변경 · 감사 기록'])assert.match(script,new RegExp(label));
  assert.match(script,/visibleDirectSections\(role\)/);
  assert.match(script,/a\.dataset\.adminSection=key/);
  assert.match(script,/a\.href=sectionHref\(key\)/);
  assert.doesNotMatch(script,/a\.dataset\.adminGroup=group\.id/);
  assert.doesNotMatch(script,/renderSecondaryNav\(activeGroup,role\)/);
  assert.match(script,/AbortSignal\.timeout\(10000\)/);
});

test('Mission admin root stays on overview and applicant roster opens from its management entry',async()=>{
  const script=await (await workspaceAdminScript()).text();
  assert.match(script,/MISSION_DEFAULT_ACTIVITY='260926-chuseok-open-table'/);
  assert.match(script,/const defaultSection='overview'/);
  assert.match(script,/activities\.some\(a=>a\.activity_key===MISSION_DEFAULT_ACTIVITY\)/);
  assert.match(script,/href="\$\{adminBase\}\/activities">관리<\/a>/);
  assert.match(script,/\['activities','행사 · 신청자'\]/);
  assert.match(script,/\/ekodimission\/apply\/260926-open-table/);
  assert.match(script,/activityCheckinFilter/);
  assert.match(script,/data-checkin/);
  assert.match(script,/공개 행사 보기/);
  assert.match(script,/신청자 관리/);
  assert.match(script,/activity-summary/);
  assert.match(script,/activity-toolbar/);
  assert.match(script,/상세 관리/);
  assert.match(script,/\+ 참가자 직접 추가/);
  assert.match(script,/<th>신청자<\/th><th>상태<\/th><th>인원<\/th><th>관리<\/th><th>조치<\/th>/);
  assert.doesNotMatch(script,/mountCommandHome|EKODITenantCommandHome/);
});

test('public-site design settings preview desktop tablet and mobile without changing Admin UI',async()=>{
  const [css,script]=await Promise.all([(await workspaceAdminCss()).text(),(await workspaceAdminScript()).text()]);
  assert.match(script,/디자인 적용 범위/);
  assert.match(script,/공개 사용자 화면에만 적용/);
  assert.match(script,/data-preview-device="desktop"/);
  assert.match(script,/data-preview-device="tablet"/);
  assert.match(script,/data-preview-device="mobile"/);
  assert.match(script,/wireDesignPreview/);
  assert.match(css,/\.design-live-preview/);
  assert.match(css,/width:min\(390px,100%\)/);
});
