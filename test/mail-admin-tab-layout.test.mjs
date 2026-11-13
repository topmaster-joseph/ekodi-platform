import test from 'node:test';
import assert from 'node:assert/strict';
import { mailAdminPage } from '../mail-admin-page.js';

// mail-admin-tab-layout-20261114-gpt6-01: layout-only, no OAuth or account API changes.
test('mail admin puts account work first and operator setup inside its own tab', async () => {
  const response = mailAdminPage();
  const html = await response.text();
  const scope = html.indexOf('id="scopeSelect"');
  const tabs = html.indexOf('role="tablist"');
  const accounts = html.indexOf('id="panel-accounts"');
  const setup = html.indexOf('id="panel-setup"');
  const push = html.indexOf('id="opPush"');
  const google = html.indexOf('id="gSetup"');
  const help = html.indexOf('id="panel-help"');
  assert.ok(scope > 0 && scope < tabs && tabs < accounts, 'scope selector and tab navigation precede account content');
  assert.ok(accounts < setup && setup < push && push < google && google < help, 'operator setup belongs to the setup tab, not the page header');
  assert.doesNotMatch(html.slice(0, setup), /id="(?:gSetup|opPush)"/);
  assert.match(html, /id="accountQuickAdd"/);
  assert.match(html, /accountQuickAdd'\)\.onclick=\(\)=>showTab\('add'\)/);
  assert.match(html, /id="setupAccess"/);
  assert.match(html, /if\(!d\.isOperator\)return;\$\('setupAccess'\)\.hidden=true/);
});

test('mail admin five tabs have accessible controls, keyboard navigation and narrow-screen scrolling', async () => {
  const html = await mailAdminPage().text();
  const nav = html.slice(html.indexOf('<nav class="tabs"'), html.indexOf('</nav>') + 6);
  assert.equal((nav.match(/role="tab"/g) || []).length, 5);
  for (const tab of ['accounts', 'add', 'docs', 'setup', 'help']) {
    assert.match(nav, new RegExp('id="tab-' + tab + '"[^>]*aria-controls="panel-' + tab + '"'));
    assert.match(html, new RegExp('id="panel-' + tab + '"'));
  }
  assert.match(html, /\.ma \.tabs\{[^}]*overflow-x:auto/);
  assert.match(html, /@media\(max-width:780px\)[^\n]*\.ma \.tabs button\{flex:0 0 auto/);
  assert.match(html, /ArrowRight/);
  assert.match(html, /ArrowLeft/);
  assert.match(html, /e\.key==='Home'/);
  assert.match(html, /e\.key==='End'/);
  assert.match(html, /\['accounts','add','docs','setup','help'\]/);
  assert.match(html, /\['add','help','docs','setup'\]\.includes\(location\.hash\.slice\(1\)\)/);
});

test('mail admin keeps existing credential and authorization paths', async () => {
  const response = mailAdminPage();
  const html = await response.text();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(html, /Gmail 읽기·발송 연결/);
  assert.match(html, /\/google-oauth-setup/);
  assert.match(html, /\/operator-push/);
  assert.match(html, /\/contexts/);
  assert.match(html, /connectGoogle\(a,'read_send'\)/);
});
