import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../sites/seonammedi/public/app.css',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/verify-seonammedi-nav-guest-native.yml',import.meta.url),'utf8');

test('committee news-only layout intentionally hides activity filter/list but retains summary and news block',()=>{
  assert.match(css,/#committee-activity\.committee-news-only #committeeActivityFilters/);
  assert.match(css,/#committee-activity\.committee-news-only #committeeActivityList/);
  for(const marker of ['committeeNewsOnly','financeCardVisible','newsBlockVisible','deliberateCommitteeLayout','filterParity'])
    assert.ok(script.includes(marker),marker);
  assert.match(script,/!clicked\.filterVisible&&!reloaded\.filterVisible/);
  assert.match(script,/clicked\.financeCardVisible&&reloaded\.financeCardVisible/);
  assert.match(script,/clicked\.newsBlockVisible&&reloaded\.newsBlockVisible/);
  assert.match(script,/item\.label==='활동이력'&&!deliberateCommitteeLayout/);
});

test('first-party privacy canary runs even when the independent Chromium UI audit is unavailable',()=>{
  const privacy=workflow.indexOf('run: node scripts/verify-seonammedi-finance-firstparty.mjs');
  const chromium=workflow.indexOf('name: Install EKODI Chromium harness');
  const ui=workflow.indexOf('name: Check canonical and customer public surfaces on PC/mobile');
  assert.ok(privacy>0&&chromium>0&&ui>0);
  assert.ok(privacy<chromium&&chromium<ui);
  assert.match(workflow,/node --test test\/seonammedi-finance-firstparty\.test\.mjs/);
});
