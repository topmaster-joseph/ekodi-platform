import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const workspace = fs.readFileSync(new URL('../workspace-admin-page.js', import.meta.url), 'utf8');
const access = fs.readFileSync(new URL('../client-access.js', import.meta.url), 'utf8');

test('workspace admin keeps workload visible and makes metrics opt-in', () => {
  assert.match(workspace, /data-ekodi-admin-view-tabs/);
  assert.match(workspace, /id="summaryCards"[^>]*hidden/);
  assert.match(workspace, /id="mainPanel"[^>]*role="tabpanel"/);
  assert.match(workspace, /aria-controls="summaryCards"/);
  assert.match(workspace, /adminView/);
});

test('workspace admin tab activates, restores URL, and preserves keyboard access', () => {
  const source = workspace.slice(workspace.indexOf('function workspaceAdminCompact() {'), workspace.indexOf('const MALL_SOURCING_TABS_CSS='));
  assert.ok(source.startsWith('function workspaceAdminCompact'));
  const events = {};
  const buttons = ['work', 'metrics'].map(view => ({
    dataset: { adminView: view },
    attrs: {}, classList: { toggle() {} },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(key, fn) { this[key] = fn; },
    focus() { document.activeElement = this; },
    click() { this.clickHandler(); },
  }));
  for (const button of buttons) button.clickHandler = () => button.click?.callback?.();
  const tabs = {
    querySelectorAll() { return buttons; },
    addEventListener(key, fn) { events[key] = fn; },
  };
  const summary = { hidden: true };
  const main = { hidden: false };
  const document = {
    activeElement: null,
    querySelector: () => tabs,
    getElementById: id => id === 'summaryCards' ? summary : main,
  };
  const location = { href: 'https://ekodi.kr/cgma/admin/members?adminView=metrics' };
  const history = {
    state: {},
    replaceState(_state, _title, relative) { location.href = new URL(relative, location.href).href; },
  };
  const window = { addEventListener(key, fn) { events[key] = fn; } };
  for (const button of buttons) {
    button.addEventListener = (key, fn) => { button[key] = fn; };
    button.click = () => button.click && button.onclick?.();
  }
  const fn = vm.runInNewContext('(' + source.trim() + ')', { document, window, history, location, URL });
  fn();
  assert.equal(summary.hidden, false);
  assert.equal(main.hidden, true);
  assert.equal(buttons[1].attrs['aria-selected'], 'true');
  buttons[0].click();
  assert.equal(summary.hidden, true);
  assert.equal(main.hidden, false);
  assert.equal(new URL(location.href).searchParams.has('adminView'), false);
  document.activeElement = buttons[0];
  events.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(buttons[1].attrs['aria-selected'], 'true');
});

test('user access toolbar uses counted tabs instead of redundant summary cards', () => {
  assert.doesNotMatch(access, /client-access-summary/);
  assert.match(access, /tab\.textContent = count == null/);
  assert.match(access, /aria-selected/);
  assert.match(access, /ArrowRight/);
  assert.match(access, /else if \(shell\.status\.value === 'pre_registered'\) shell\.status\.value = ''/);
});
