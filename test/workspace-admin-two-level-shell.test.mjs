import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceAdminPage, workspaceAdminCss, workspaceAdminScript } from '../workspace-admin-page.js';

test('workspace admin uses Admin UI v3 primary axes with contextual secondary navigation', async()=>{
  const responses=[workspaceAdminPage(),workspaceAdminCss(),workspaceAdminScript()];
  const [html,css,script]=await Promise.all(responses.map(response=>response.text()));

  assert.match(html,/data-ekodi-admin-layout="two-level"/);
  assert.match(html,/data-ekodi-admin-theme="light"/);
  assert.match(html,/data-ekodi-admin-nav-mode="primary"/);
  assert.match(html,/id="sectionNav"[^>]*data-ekodi-admin-subnav/);
  assert.match(html,/운영공간 확인 중/);
  assert.doesNotMatch(html,/<strong id="scopeLabel">에코디비즈<\/strong>/);
  assert.match(html,/관리자 인증과 운영공간 권한을 확인하고 있습니다/);

  assert.match(css,/\.topbar\{display:none/);
  assert.match(css,/\.sidebar\{position:sticky;top:0;height:100dvh[^}]*overflow:hidden/);
  assert.match(css,/\.admin-subnav\{[^}]*justify-content:flex-start/);
  assert.match(css,/main>\*\{width:100%;max-width:1480px\}/);
  assert.match(css,/\.design-frame\[data-device="mobile"\]/);
  assert.match(css,/\.ekodi-admin-shell-nav\[data-ekodi-admin-nav-mode="primary"\][^{]*\{[^}]*overflow:hidden!important/);

  assert.match(script,/label:'통합현황'/);
  assert.match(script,/label:'서비스'/);
  assert.match(script,/label:'사이트'/);
  assert.match(script,/label:'사용자 · 권한'/);
  assert.match(script,/label:'콘텐츠 · 운영'/);
  assert.match(script,/label:'상태 · 배포'/);
  assert.match(script,/label:'설정 · 기록'/);
  assert.match(script,/a\.dataset\.adminGroup=group\.id/);
  assert.match(script,/a\.href=sectionHref\(firstKey\)/);
  assert.match(script,/renderSecondaryNav\(activeGroup,role\)/);
  assert.match(script,/h\.hidden=false/);
  assert.match(script,/a\.dataset\.adminSection=key/);
  assert.match(script,/AbortSignal\.timeout\(10000\)/);
  assert.match(script,/운영 데이터 비공개/);
  assert.match(script,/에코디몰 관리자 로그인/);
});

test('Mission applicant administration is task-first and links to the public event', async()=>{
  const script=await (await workspaceAdminScript()).text();
  assert.match(script,/\['activities','행사 · 신청자'\]/);
  assert.match(script,/260926-chuseok-open-table/);
  assert.match(script,/\/ekodimission\/apply\/260926-open-table/);
  assert.match(script,/activityCheckinFilter/);
  assert.match(script,/data-checkin/);
  assert.match(script,/공개 행사 보기/);
  assert.match(script,/신청자 관리/);
  assert.match(script,/activity_admin_snapshot/);
  assert.match(script,/activity_admin_update_participation/);
});

test('workspace design management keeps Admin UI fixed and previews public UI by device', async()=>{
  const [css,script]=await Promise.all([(await workspaceAdminCss()).text(),(await workspaceAdminScript()).text()]);
  assert.match(script,/디자인 적용 범위/);
  assert.match(script,/공개 사용자 화면에만 적용/);
  assert.match(script,/data-preview-device="desktop"/);
  assert.match(script,/data-preview-device="tablet"/);
  assert.match(script,/data-preview-device="mobile"/);
  assert.match(script,/designPreviewFrame/);
  assert.match(script,/wireDesignPreview/);
  assert.match(css,/\.design-live-preview/);
  assert.match(css,/width:min\(390px,100%\)/);
});

test('Mall navigation remains one level and routes directly to each operating screen', async()=>{
  const script=await (await workspaceAdminScript()).text();
  assert.match(script,/mallDirectSections/);
  assert.match(script,/\['overview','대시보드'\]/);
  assert.match(script,/\['products','상품'\]/);
  assert.match(script,/\['sourcing','공급·제휴'\]/);
  assert.match(script,/\['channels','판매채널'\]/);
  assert.match(script,/\['growth','AI 영업'\]/);
  assert.match(script,/\['analytics','성과'\]/);
  assert.match(script,/\['confirmations','지급·수령'\]/);
  assert.match(script,/\['design','관리설정'\]/);
  assert.match(script,/a\.href=sectionHref\(key\)/);
  assert.match(script,/key==='design'&&section==='languages'/);
});
