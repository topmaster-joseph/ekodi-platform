import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITES, header, plan } from '../scripts/site-chrome.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('publishing navigation is generated consistently on every publishing page', () => {
  const nav = new Map(SITES.publishing.nav);
  assert.equal(nav.get('내 원고·프로젝트'), 'https://ekodi.kr/publishing/#ws-mine');
  assert.equal(nav.get('출간 준비 현황'), 'https://ekodi.kr/publishing/#ws-progress');
  const rendered = header('publishing');
  for (const target of ['#ws-mine', '#ws-progress']) assert.ok(rendered.includes(target));
  for (const page of SITES.publishing.pages) {
    assert.ok(plan().get(page).includes('href="https://ekodi.kr/publishing/#ws-mine"'), page);
    assert.ok(plan().get(page).includes('href="https://ekodi.kr/publishing/#ws-progress"'), page);
  }
});

test('publishing home offers project, status and review links at first glance', () => {
  const home = read('publishing/index.html');
  for (const [href, label] of [
    ['#ws-mine', '내 원고 확인'],
    ['#ws-progress', '출간 준비 현황'],
    ['/human/manage/', '원고 상세관리']
  ]) assert.ok(home.includes('href="' + href + '">' + label), label);
});

test('same-document workspace links switch panels while preserving ordinary anchors', () => {
  const src = read('publishing/workspace.js');
  assert.match(src, /window\.addEventListener\('hashchange',/);
  assert.match(src, /const id = tabFromHash\(\)/);
  assert.match(src, /if \(!id\) return/);
  assert.match(src, /show\(id\);/);
  assert.match(src, /root\.scrollIntoView\(\{ block: 'start' \}\)/);
  assert.match(src, /authorization: `Bearer \$\{t\}`/);
});
