import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
const start=source.indexOf('function serviceMenuVisible(key){');
const end=source.indexOf('async function siteServiceApi(',start);
assert.ok(start>=0&&end>start,'site menu projection function must be present');

const visibilityFor=(service,items)=>new Function('service','siteServiceSnapshot',
  source.slice(start,end)+'\nreturn serviceMenuVisible;')(service,items===null?null:{items});

const item=(navSection,menuVisible,readiness='ready')=>({navSection,menuVisible,readiness});

test('Mall local channels menu follows all linked publishing service preferences',()=>{
  const hidden=visibilityFor('mall',[
    item('publishing',false),item('publishing',false),item('publishing',false)
  ]);
  assert.equal(hidden('channels'),false,'all 3 linked services are hidden');
  const partial=visibilityFor('mall',[
    item('publishing',false),item('publishing',true),item('publishing',false)
  ]);
  assert.equal(partial('channels'),true,'any visible linked service keeps channel menu visible');
});

test('site aliases cannot change unrelated service sections or readiness rules',()=>{
  const get=visibilityFor('mall',[
    item('publishing',false),item('marketing',true),item('channels',true,'planned')
  ]);
  assert.equal(get('channels'),false,'planned local channel cannot override shared catalog');
  assert.equal(get('marketing'),true);
  assert.equal(get('overview'),true,'unmapped mandatory menu remains unaffected');
  const other=visibilityFor('ekodibiz',[item('publishing',false)]);
  assert.equal(other('publishing'),false);
  assert.equal(other('channels'),true,'Mall alias must never affect other sites');
});

test('menu rendering remains fail-open on unavailable visibility snapshot without granting permissions',()=>{
  const unavailable=visibilityFor('mall',null);
  assert.equal(unavailable('channels'),true);
  assert.match(source,/role\?!canSection\(key,role\)/,'role capability gate must remain in nav rendering');
});
