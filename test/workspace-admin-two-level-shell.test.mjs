import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceAdminPage, workspaceAdminCss, workspaceAdminScript } from '../workspace-admin-page.js';

test('workspace admin uses the seven-axis Admin UI v3 shell',async()=>{
  const [html,css,script]=await Promise.all([
    workspaceAdminPage().then(r=>r.text()),
    workspaceAdminCss().then(r=>r.text()),
    workspaceAdminScript().then(r=>r.text()),
  ]);
  assert.match(html,/data-ekodi-admin-layout="two-level"/);
  assert.match(html,/운영공간 확인 중/);
  assert.doesNotMatch(html,/tenant-admin-command-home/);
  assert.match(html,/관리자 인증과 운영공간 권한을 확인하고 있습니다/);
  assert.match(css,/\.topbar\{display:none/);
  assert.match(css,/\.sidebar\{position:sticky;top:0;height:100dvh/);
  assert.match(css,/\.admin-subnav\{[^}]*justify-content:flex-start/);
  for(const label of ['통합현황','서비스','사이트','사용자 · 권한','콘텐츠 · 운영','상태 · 배포','설정 · 기록'])assert.match(script,new RegExp(label));
  assert.match(script,/a\.dataset\.adminGroup=group\.id/);
  assert.match(script,/renderSecondaryNav\(activeGroup,role\)/);
  assert.match(script,/AbortSignal\.timeout\(10000\)/);
});

test('Mission admin root opens the Chuseok applicant roster directly',async()=>{
  const script=await (await workspaceAdminScript()).text();
  assert.match(script,/MISSION_DEFAULT_ACTIVITY='260926-chuseok-open-table'/);
  assert.match(script,/defaultSection=workspace==='ekodimission'&&!service\?'activities':'overview'/);
  assert.match(script,/activities\.some\(a=>a\.activity_key===MISSION_DEFAULT_ACTIVITY\)/);
  assert.match(script,/행사 · 신청자/);
  assert.match(script,/\/ekodimission\/apply\/260926-open-table/);
  assert.match(script,/activityCheckinFilter/);
  assert.match(script,/data-checkin/);
  assert.match(script,/공개 행사 보기/);
  assert.match(script,/신청자 관리/);
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
