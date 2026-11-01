// PUBLISHING-WORKSPACE-TABS-001 (§11): 출판 첫 화면의 탭형 작업실.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('publishing home exposes one accessible tablist whose tabs each control a panel', () => {
  const html = read('publishing/index.html');
  const tabs = [...html.matchAll(/role="tab" id="tab-([a-z]+)" data-tab="\1" aria-controls="ws-\1"/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['mine', 'write', 'progress', 'editions', 'channels', 'royalty', 'support']);
  for (const id of tabs) assert.match(html, new RegExp(`role="tabpanel" id="ws-${id}" aria-labelledby="tab-${id}"`));
  assert.match(html, /<script src="\/workspace\.js" defer><\/script>/);
});

test('workspace script uses canonical URLs, central login with exact return, and never fakes data', () => {
  const js = read('publishing/workspace.js');
  assert.doesNotMatch(js, /(["'`])\/(?!\/)/, 'no root-path literals the gateway would re-prefix');
  assert.match(js, /new URL\(`\$\{ORIGIN\}\/auth\/`\)/);
  assert.match(js, /searchParams\.set\('return_to', location\.href\)/);
  assert.match(js, /AbortController/, 'bounded requests: no infinite loading');
  assert.match(js, /다시 시도/, 'failed loads offer retry');
  assert.doesNotMatch(js, /royalty(Rate|Percent)\s*[:=]\s*\d/, 'no invented royalty rates');
});

test('manuscript manager login link is not rewritten by the /publishing gateway', () => {
  const js = read('publishing/human/manage/app.js');
  assert.doesNotMatch(js, /href='\/auth\//);
  assert.match(js, /new URL\('https:\/\/ekodi\.kr\/auth\/'\)/);
});
