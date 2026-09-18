import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('admin navigation names the device surface by the information administrators look for', async () => {
  const registry = await read('admin-menu-registry.js');
  const demand = await read('admin-demand-loader.js');
  assert.match(registry, /로컬컴퓨터·기기/);
  assert.match(registry, /Local Computers & Devices/);
  assert.match(demand, /label: '로컬컴퓨터·기기'/);
});

test('device admin shows status and attention before setup controls', async () => {
  const source = await read('device-control-admin.js');
  const metrics = source.indexOf('class="device-metrics"');
  const attention = source.indexOf('id="deviceAttentionSummary"');
  const list = source.indexOf('id="ekodiDeviceList"');
  const setup = source.indexOf('class="device-setup-tools"');
  assert.ok(metrics >= 0 && attention > metrics && list > attention && setup > list);
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
