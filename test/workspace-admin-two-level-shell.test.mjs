import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceAdminPage, workspaceAdminCss, workspaceAdminScript } from '../workspace-admin-page.js';

test('workspace admin keeps the shared shell while all tenant menus navigate directly', async()=>{
  const responses=[workspaceAdminPage(),workspaceAdminCss(),workspaceAdminScript()];
  const [html,css,script]=await Promise.all(responses.map(response=>response.text()));

  assert.match(html,/data-ekodi-admin-layout="two-level"/);
  assert.match(html,/data-ekodi-admin-theme="light"/);
  assert.match(html,/data-ekodi-admin-nav-mode="primary"/);
  assert.match(html,/id="sectionNav"[^>]*data-ekodi-admin-subnav/);
  assert.match(css,/\.sidebar\{position:sticky;top:58px;height:calc\(100dvh - 58px\)[^}]*overflow:hidden/);
  assert.match(css,/\.ekodi-admin-shell-nav\[data-ekodi-admin-nav-mode="primary"\][^{]*\{[^}]*overflow:hidden!important/);
  assert.match(css,/main\{[^}]*max-width:none/);
  assert.match(script,/const mallDirectSections=\[\['overview','홈'\],\['products','상품'\],\['sourcing','공급·제휴'\],\['channels','판매채널'\],\['growth','AI 영업'\],\['analytics','성과'\],\['design','설정'\]\]/);
  assert.match(script,/function renderSecondaryNav\(_groupId,_role=workspaceRole\)\{[^}]*h\.hidden=true/);
  assert.match(script,/admin-nav-group-label/);
  assert.match(script,/소통 · 홍보/);
  assert.match(script,/마케팅 AI/);
  assert.match(script,/SNS 채널·자동게시/);
  assert.match(script,/publishing:\['SNS','채널','계정 연결','OAuth','쇼츠','자동게시','예약게시'\]/);
  assert.match(script,/a\.href=sectionHref\(key\)/);
  assert.match(script,/dataset\.adminSection=key/);
  assert.doesNotMatch(script,/data\.adminGroup=group\.id/);
  assert.doesNotMatch(script,/로그인 후 세부 메뉴가 표시됩니다/);
  assert.match(script,/운영 데이터 비공개/);
  assert.match(script,/Google 계정으로 관리자 확인/);
  assert.match(css,/\.mall-quick-actions/);
});

test('Mall navigation is one level and routes directly to each operating screen', async()=>{
  const script=await (await workspaceAdminScript()).text();
  assert.match(script,/mallDirectSections/);
  assert.match(script,/\['overview','홈'\]/);
  assert.match(script,/\['products','상품'\]/);
  assert.match(script,/\['sourcing','공급·제휴'\]/);
  assert.match(script,/\['channels','판매채널'\]/);
  assert.match(script,/\['growth','AI 영업'\]/);
  assert.match(script,/\['analytics','성과'\]/);
  assert.match(script,/\['design','설정'\]/);
  assert.match(script,/sectionHref=key=>key==='overview'\?\`\$\{adminBase\}\/overview\`:.*channel-settings/s);
  assert.match(script,/a\.href=sectionHref\(key\)/);
  assert.match(script,/key==='design'&&section==='languages'/);
  assert.doesNotMatch(script,/label:'판매 · 마케팅'/);
});

test('workspace admin retains compatible secondary-nav styling but does not require it for navigation', async()=>{
  const css=await (await workspaceAdminCss()).text();
  assert.match(css,/\.admin-subnav\{[^}]*justify-content:flex-end/);
  const script=await (await workspaceAdminScript()).text();
  assert.match(script,/h\.hidden=true/);
});
