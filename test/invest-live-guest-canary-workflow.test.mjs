// INVEST-GUEST-LIVE-CANARY-20261114: protect the My production read-only Invest probe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/deploy-my.yml',import.meta.url),'utf8');
const tag='      - name: Verify Invest anonymous production routes (read-only)';
const before='      - name: Verify canonical My EKODI production surface, private workspace routes, Life Journey and universal membership';
const after='      - name: Publish My EKODI production status';
const start=workflow.indexOf(tag);
const end=workflow.indexOf(after,start);
const block=start>=0&&end>start?workflow.slice(start,end):'';

test('guest-only Invest check is placed after guarded production verification and before status publication',()=>{
  assert.ok(start>workflow.indexOf(before),'preexisting protected My validation runs first');
  assert.ok(end>start,'the guest canary cannot run outside the production job');
  assert.equal(workflow.split(tag).length,2,'exactly one guest canary exists');
});

test('only GET checks are performed and no authorization or broker-order request is sent',()=>{
  for(const path of ['/invest/my','/style.css','/access','/not-a-real-route']){
    assert.ok(block.includes(path),'missing route '+path);
  }
  assert.doesNotMatch(block,/authorization:|Bearer |X-Tossinvest-|\/broker\/orders|curl[^\n]*\s-X\s+(?:POST|PUT|PATCH|DELETE)\b/i);
  assert.match(block,/html_code.*'200'/s);
  assert.match(block,/css_code.*'200'/s);
  assert.match(block,/access_code.*'401'/s);
  assert.match(block,/unknown_code.*'404'/s);
});

test('guest assets and no-data/noindex controls are fail-closed',()=>{
  for(const evidence of [
    'text/html','text/css','application/json','private, no-store','noindex',
    'id="ownerSidebar"','id="investAuthIntro"','<section id="owner" hidden>',
    '.shell:has(> #ownerSidebar[hidden]){display:block}',
    'word-break:keep-all;overflow-wrap:normal',
    'max-width:480px','authentication_required','실거래 주문',
    'Invest guest live contract failed'
  ])assert.ok(block.includes(evidence),'missing guarded check '+evidence);
  assert.match(block,/exit 1/,'no success claim when retry budget is exhausted');
});
