import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceAdminPage, workspaceAdminCss, workspaceAdminScript } from '../workspace-admin-page.js';

test('workspace admin uses the shared two-level navigation contract', async()=>{
  const responses=[workspaceAdminPage(),workspaceAdminCss(),workspaceAdminScript()];
  const [html,css,script]=await Promise.all(responses.map(response=>response.text()));

  assert.match(html,/data-ekodi-admin-layout="two-level"/);
  assert.match(html,/data-ekodi-admin-theme="light"/);
  assert.match(html,/data-ekodi-admin-nav-mode="primary"/);
  assert.match(html,/id="sectionNav"[^>]*data-ekodi-admin-subnav/);
  assert.match(css,/\.sidebar\{position:sticky;top:58px;height:calc\(100dvh - 58px\)[^}]*overflow:hidden/);
  assert.match(css,/\.ekodi-admin-shell-nav\[data-ekodi-admin-nav-mode="primary"\][^{]*\{[^}]*overflow:hidden!important/);
  assert.match(css,/main\{[^}]*max-width:none/);
  assert.match(script,/const mallGroups=\[/);
  assert.match(script,/label:'상품'/);
  assert.match(script,/label:'판매 · 마케팅'/);
  assert.match(script,/label:'AI 영업'/);
  assert.match(script,/function renderSecondaryNav/);
  assert.match(script,/로그인 후 세부 메뉴가 표시됩니다/);
});

test('mall primary groups keep detail routes in the upper secondary navigation', async()=>{
  const script=await (await workspaceAdminScript()).text();
  assert.match(script,/id:'catalog'.*\['products','상품관리'\].*\['sourcing','제휴·소싱'\]/s);
  assert.match(script,/id:'marketing'.*\['channels','채널·게시'\]/s);
  assert.match(script,/id:'ai-sales'.*\['growth','AI 자동영업'\].*\['analytics','성과·학습'\]/s);
  assert.doesNotMatch(script,/\[null,'상품'\]/);
});

test('workspace admin keeps the desktop secondary menu at the upper right', async()=>{
  const css=await (await workspaceAdminCss()).text();
  assert.match(css,/\.admin-subnav\{[^}]*justify-content:flex-end/);
});
