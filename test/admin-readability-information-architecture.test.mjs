import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('admin navigation preserves the governed device label while the page uses readable local-computer language', async () => {
  const registry = await read('admin-menu-registry.js');
  const demand = await read('admin-demand-loader.js');
  const device = await read('device-control-admin.js');
  assert.match(registry, /실행 인프라/);
  assert.match(registry, /Execution Infrastructure/);
  assert.match(demand, /label: '실행 인프라'/);
  assert.match(device, /로컬컴퓨터·기기/);
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
  assert.doesNotMatch(source, /id="deviceMetric(?:Total|Online|Issues|Health|Queued)">—/);
  assert.match(source, /setDeviceLoadState\('loading'\)/);
  assert.match(source, /조회 실패/);
  assert.match(source, /data-device-retry/);
  assert.match(source, /미측정/);
});

test('device browser diagnostics run automatically without server upload', async () => {
  const source = await read('device-browser-diagnostics.js');
  assert.match(source, /자동 진단 준비/);
  assert.match(source, /queueMicrotask\(\(\) => diagnoseButton\.click\(\)\)/);
  assert.match(source, /서버 업로드 없음/);
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

test('all admin surfaces inherit compact readable density and left-anchored work content', async () => {
  const [engine, workbench] = await Promise.all([
    read('admin-design-engine.css'),
    read('admin-conversation-workbench.css'),
  ]);
  assert.match(engine, /ADMIN-READABILITY-004/);
  assert.match(engine, /margin-left:0!important/);
  assert.match(engine, /min-height:38px!important/);
  assert.match(engine, /min-height:34px!important/);
  assert.match(engine, /line-height:1\.48!important/);
  assert.match(workbench, /justify-content:center!important/);
  assert.match(workbench, /min-width:156px!important/);
  assert.match(workbench, /text-overflow:clip!important/);
});
