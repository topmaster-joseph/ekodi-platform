import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAdminWorkStrip } from '../admin-sidebar.js';

function fakeDoc() {
  const chosen = [];
  const strip = {
    className: 'admin-work-strip',
    dataset: {},
    setAttribute(key, val) { this[key] = val; },
    replaceChildren(...nodes) { this.nodes = nodes; },
    querySelectorAll() { return this.nodes.filter(n => n.className?.includes('admin-work-strip-item')); },
    contains(node) { return this.nodes.includes(node); },
  };
  const main = { querySelector() { return strip; } };
  const doc = {
    activeElement: null,
    querySelector(selector) { return selector === '#app main' ? main : null; },
    createElement(tag) {
      const node = {
        tagName: tag,
        className: '',
        dataset: {},
        classList: { toggle() {} },
        setAttribute(key, val) { this[key] = val; },
        append() {},
        focus() { doc.activeElement = this; },
        click() {
          strip.onclick({
            target: { closest: () => node },
            preventDefault() {},
          });
        },
      };
      return node;
    },
  };
  return { doc, strip, chosen };
}
const items = [
  { id: 'summary', label: '운영' },
  { id: 'members', label: '회원' },
  { id: 'finance', label: '재무' },
];

test('shared platform admin strip supports roving focus, keyboard selection and preservation of existing action', () => {
  const {doc, strip, chosen} = fakeDoc();
  renderAdminWorkStrip(items, { doc, active: 'members', onSelect: id => chosen.push(id) });
  const tabs = strip.querySelectorAll();
  assert.deepEqual(tabs.map(t => t.tabIndex), [-1, 0, -1]);
  assert.deepEqual(tabs.map(t => t['aria-selected']), ['false', 'true', 'false']);
  assert.equal(strip.role, undefined);
  doc.activeElement = tabs[1];
  let prevented = 0;
  strip.onkeydown({ key: 'ArrowRight', preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(doc.activeElement, tabs[2]);
  assert.deepEqual(chosen, ['finance']);
  strip.onkeydown({ key: 'Home', preventDefault() {} });
  assert.deepEqual(chosen, ['finance', 'summary']);
  strip.onkeydown({ key: 'End', preventDefault() {} });
  assert.deepEqual(chosen, ['finance', 'summary', 'finance']);
});

test('first tab is tabbable when no active selection; unrelated keys are untouched', () => {
  const {doc, strip, chosen} = fakeDoc();
  renderAdminWorkStrip(items, {doc, active: 'not-in-list', onSelect: id => chosen.push(id)});
  assert.deepEqual(strip.querySelectorAll().map(t => t.tabIndex), [0, -1, -1]);
  doc.activeElement = strip.querySelectorAll()[0];
  strip.onkeydown({key: 'Escape', preventDefault() {throw Error('must not prevent Escape')}});
  assert.deepEqual(chosen, []);
});
