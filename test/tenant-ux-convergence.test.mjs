import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('delegated admins use task-first navigation without changing authority',async()=>{
  const [workspace,store,church,trade,portfolio]=await Promise.all([
    read('workspace-admin-page.js'),
    read('store-admin-engine.js'),
    read('church-pastor-admin-page.js'),
    read('workspace-trade-admin-page.js'),
    read('store-portfolio-admin-page.js'),
  ]);

  assert.match(workspace,/label:'홈'/);
  assert.match(workspace,/label:'소통 · 홍보'/);
  assert.match(workspace,/label:'운영 · 재무'/);
  assert.match(workspace,/label:'사이트 · 설정'/);
  assert.match(workspace,/mallDirectSections/);

  assert.match(store,/label:'주문 · 판매'/);
  assert.match(store,/label:'메뉴 · 재고'/);
  assert.match(store,/label:'고객 · 리뷰'/);
  assert.match(store,/label:'홍보 · 채널'/);
  assert.match(store,/label:'운영 · 설정'/);
  assert.match(store,/function renderSecondaryNav/);

  assert.match(church,/label:'사람 · 돌봄'/);
  assert.match(church,/label:'예배 · 사역'/);
  assert.match(church,/label:'기록 · AI'/);
  assert.match(church,/label:'사이트 · 권한'/);
  assert.match(church,/admin-nav-group-label/);
  assert.match(church,/dataset\.adminSection=key/);

  assert.match(trade,/['overview','홈']/);
  assert.match(trade,/['companies','거래처']/);
  assert.match(trade,/['access','권한']/);
  assert.match(trade,/const a=document\.createElement\('a'\);a\.href=sectionHref\(key\)/);

  assert.match(portfolio,/PORTFOLIO_ACTIONS/);
  assert.match(portfolio,/['orders','주문 · 매출']/);
  assert.match(portfolio,/['menu','메뉴 · 재고']/);
  assert.match(portfolio,/['reviews','고객 · 리뷰']/);
  assert.match(portfolio,/['marketing','홍보 · 채널']/);
});

test('shared shells enforce readable public and delegated-admin geometry',async()=>{
  const [userCss,workspaceCss,injector]=await Promise.all([
    read('shell/user-ui-shell.css'),
    read('shell/workspace.css'),
    read('ekodi-shell-injector.js'),
  ]);
  assert.match(userCss,/Tenant readability convergence v2/);
  assert.match(userCss,/line-height:1\.7/);
  assert.match(userCss,/min-height:44px/);
  assert.match(userCss,/text-wrap:balance/);
  assert.match(workspaceCss,/Tenant \/ delegated admin readability convergence v2/);
  assert.match(workspaceCss,/data-ekodi-authority-scope="tenant"/);
  assert.match(workspaceCss,/--ekodi-tenant-admin-touch:44px/);
  assert.match(injector,/SHELL_USER_UI_STYLE/);
  assert.match(injector,/SHELL_WORKSPACE_STYLE/);
});

test('multi-store public gateway avoids duplicate same-destination actions',async()=>{
  const source=await read('store-gateway-page.js');
  assert.match(source,/매장 보기/);
  assert.match(source,/메뉴 · 가격 바로가기/);
  assert.match(source,/\$\{store\.slug\}#menu/);
  assert.doesNotMatch(source,/매장 정보 · 주문 · 배달/);
});
