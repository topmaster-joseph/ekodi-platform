import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const hub = await readFile(new URL('../hub.html', import.meta.url), 'utf8');
const scriptMatch = hub.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'hub inline script is required');
const hubScript = scriptMatch[1];

function renderHub(pathname) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) {
      elements.set(selector, {
        textContent: '',
        innerHTML: '',
        classList: { add() {}, toggle() {} },
      });
    }
    return elements.get(selector);
  };
  const document = {
    title: '',
    querySelector: element,
  };
  const location = {
    hostname: 'ekodi.kr',
    pathname,
    href: `https://ekodi.kr${pathname}`,
  };
  vm.runInNewContext(hubScript, { document, location, URL }, { timeout: 1000 });
  return {
    documentTitle: document.title,
    heading: element('#title').textContent,
    eyebrow: element('#eyebrow').textContent,
    context: element('#context').textContent,
  };
}

test('hub inline script compiles and renders Pay and Cloud from canonical apex paths', () => {
  const pay = renderHub('/pay');
  assert.equal(pay.documentTitle, 'EKODI Pay · EKODI');
  assert.equal(pay.heading, 'EKODI Pay');
  assert.equal(pay.eyebrow, 'PAYMENT GATE');
  assert.equal(pay.context, 'ekodi.kr/pay');

  const cloud = renderHub('/cloud');
  assert.equal(cloud.documentTitle, 'EKODI Cloud · EKODI');
  assert.equal(cloud.heading, 'EKODI Cloud');
  assert.equal(cloud.eyebrow, 'CLOUD LOBBY');
  assert.equal(cloud.context, 'ekodi.kr/cloud');

  const paySlash = renderHub('/pay/');
  assert.equal(paySlash.heading, 'EKODI Pay');
});

test('hub source uses canonical path-only routing and apex Admin/Auth links', () => {
  assert.match(hub, /const rawPath = location\.pathname \|\| '\/'/);
  assert.match(hub, /if \(path === '\/pay'\)/);
  assert.match(hub, /else if \(path === '\/cloud'\)/);
  assert.doesNotMatch(hub, /https:\/\/admin\.ekodi\.kr/);
  assert.doesNotMatch(hub, /https:\/\/auth\.ekodi\.kr/);
  assert.match(hub, /https:\/\/ekodi\.kr\/admin\//);
  assert.match(hub, /https:\/\/ekodi\.kr\/auth\//);
});
