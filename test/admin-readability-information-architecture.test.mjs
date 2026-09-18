import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('admin keeps the canonical execution-infrastructure taxonomy while the device page stays plain-language', async () => {
  const registry = await read('admin-menu-registry.js');
  const demand = await read('admin-demand-loader.js');
  const device = await read('device-control-admin.js');
  assert.match(registry, /ko: '실행 인프라', en: 'Execution Infrastructure'/);
  assert.match(demand, /label: '실행 인프라'/);
  assert.match(device, /<h2>로컬컴퓨터·기기<\\/h2>/);
  assert.match(device, /REMOTE WORK & DEVICE MANAGEMENT · LOCAL COMPUTERS/);
});

test('device admin prioritizes status and attention before setup controls at runtime', async () => {
  const source = await read('device-control-admin.js');
  assert.match(source, /id="deviceAttentionSummary"/);
  assert.match(source, /insertAdjacentElement\('afterend', metrics\)/);
  assert.match(source, /metrics\.insertAdjacentElement\('afterend', attention\)/);
  assert.match(source, /attention\.insertAdjacentElement\('afterend', filters\)/);
  assert.match(source, /filters\.insertAdjacentElement\('afterend', list\)/);
  assert.match(source, /className = 'device-setup-tools'/);
  assert.match(source, /확인 필요 \$\{issues\.length\}대/);
  assert.match(source, /세부 관리 · 고급 작업/);
  assert.match(source, /LOCAL COMPUTERS · DEVICES/);
});

test('shared admin design engine carries the information hierarchy across admin surfaces', async () => {
  const css = await read('admin-design-engine.css');
  assert.match(css, /EKODI Admin information hierarchy v3/);
  assert.match(css, /\.content>\[data-panel\]/);
  assert.match(css, /grid-template-columns:repeat\(auto-fit,minmax\(165px,1fr\)\)/);
  assert.match(css, /details>summary/);
});

test('admin home keeps the conversation-first surface but raises readable type sizes', async () => {
  const css = await read('admin-assist-dock.css');
  assert.match(css, /EKODI Admin home conversation readability v3/);
  assert.match(css, /\.ekodi-assist-bubble\{font-size:15px/);
  assert.match(css, /\.ekodi-assist-command\{font-size:15px/);
});
