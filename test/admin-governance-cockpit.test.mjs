import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('../mission-control-admin.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../mission-control-admin.css', import.meta.url), 'utf8');

test('admin primary navigation is governance-first rather than tool-first', () => {
  for (const label of ['Overview','Decisions','Ecosystem','AI Council','System']) assert.match(js, new RegExp(`label:'${label.replace(' ','\\s?')}'|label:'${label}'`));
  assert.doesNotMatch(js, /label:'Campus'/);
  assert.doesNotMatch(js, /label:'Money'/);
});

test('cockpit makes delegated AI operation and human decision gates explicit', () => {
  assert.match(js, /관리자는 직접 운영하지 않고/);
  assert.match(js, /HUMAN DECISION GATE/);
  assert.match(js, /저위험 점검·재시도·가역조치는 AI가 처리/);
  for (const agent of ['Chief AI','Platform AI','Site AI','Workspace AI','Security AI','Release AI','Finance AI']) assert.match(js, new RegExp(agent));
});

test('chief AI command bar is always available for direction setting', () => {
  assert.match(js, /governanceCommandBar/);
  assert.match(js, /방향 설정이나 중요한 결정을 지시하세요/);
  assert.match(js, /askChief\(text\)/);
  assert.match(css, /\.governance-command-bar\{position:fixed/);
});

test('system detail remains available without dominating normal navigation', () => {
  assert.match(js, /governance-system-open/);
  assert.match(js, /routeSection\('deployments'\)/);
  assert.match(css, /not\(\.governance-system-open\) \.mission-secondary-nav\{display:none!important\}/);
});