import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sites/ekodi-insurance/public/app.js', import.meta.url), 'utf8');
const beginning = source.indexOf('function handleHumanRequest(e){');
const end = source.indexOf('\nfunction resetAdvisorChat()', beginning);
assert.ok(beginning >= 0 && end > beginning, 'production handler source must be present');
const actualHandler = source.slice(beginning, end);

function sandbox(hostname, pathname) {
  const notifications = [], elements = [], local = {
    policies: [], claims: [], consultations: [],
    advisorChat: { messages: [{ role: 'user', text: 'synthetic private note', createdAt: '2026-10-30' }] }
  };
  const form = {
    resetCount: 0,
    querySelector(selector) { return selector === '#insuranceHandoffFallbackStatus' ? elements[0] || null : null; },
    append(element) { elements.push(element); },
    reset() { this.resetCount++; }
  };
  let formDataCalls = 0, persisted = 0, viewHidden = 0;
  const ctx = {
    location: { hostname, pathname },
    document: { createElement(tag) {
      assert.equal(tag, 'p');
      return { setAttribute() {}, textContent: '', id: '', className: '' };
    } },
    state: local,
    FormData: class {
      constructor() {
        formDataCalls++;
        return [['name','Synthetic'],['contact','010-0000-0000'],['preferredTime','오후']];
      }
    },
    toast(value) { notifications.push(value); },
    saveState() { persisted++; },
    showHumanRequest() { viewHidden++; },
    addChatMessage() {},
    summarizeConversation() { return 'local-only'; },
    uid() { return 'synthetic-id'; },
    Date, Object,
  };
  vm.runInNewContext(actualHandler, ctx);
  return {
    invoke() {
      let prevented = false;
      ctx.handleHumanRequest({ currentTarget: form, preventDefault() { prevented = true; } });
      return { prevented, formDataCalls, persisted, viewHidden, form, local, elements, notifications };
    }
  };
}

test('canonical insurance never simulates a submitted server consultation when bridge is missing', () => {
  const harness = sandbox('ekodi.kr', '/insurance');
  const first = harness.invoke();
  assert.equal(first.prevented, true);
  assert.equal(first.formDataCalls, 0, 'cannot read contact or transcript without bridge');
  assert.equal(first.persisted, 0);
  assert.equal(first.local.consultations.length, 0);
  assert.equal(first.form.resetCount, 0, 'must leave user form intact for retry');
  assert.equal(first.elements.length, 1);
  assert.match(first.elements[0].textContent, /접수되지 않았습니다/);
  assert.match(first.notifications[0], /접수하지 않았습니다/);
  const second = harness.invoke();
  assert.equal(second.elements.length, 1, 'only one accessible failure status');
  assert.equal(second.persisted, 0);
  assert.equal(second.local.consultations.length, 0);
});

test('canonical /insurance/advisor prefix is also fail-closed', () => {
  const result = sandbox('ekodi.kr', '/insurance/advisor').invoke();
  assert.equal(result.local.consultations.length, 0);
  assert.equal(result.persisted, 0);
});

test('historical staging local-only demonstration remains local (no network submission)', () => {
  const result = sandbox('legacy-test.invalid', '/').invoke();
  assert.equal(result.local.consultations.length, 1);
  assert.equal(result.persisted, 1);
  assert.equal(result.form.resetCount, 1);
  assert.equal(result.elements.length, 0);
  assert.equal(result.local.consultations[0].source, 'AI_CHAT_HANDOFF');
});

test('fallback handler contains no direct server fetch, credential forwarding or token copying', () => {
  assert.doesNotMatch(actualHandler, /\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\baccessToken\b/);
  assert.match(actualHandler, /hostname==='ekodi\.kr'/);
  assert.match(actualHandler, /return;\s*\}/);
});
