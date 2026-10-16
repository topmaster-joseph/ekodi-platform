import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../auth-site/auth-entry.js',import.meta.url),'utf8');
const interactiveLine=source.split('\n').find(line=>line.startsWith('const interactive ='));
const repeatLine=source.split('\n').find(line=>line.startsWith('const repeated ='));
assert.ok(interactiveLine&&repeatLine,'Central auth loop guard expressions must remain present');

function classify(query,{navigationType='navigate',previous=Date.now()-1000}={}){
  const context={params:new URLSearchParams(query),navigationType,previous,now:Date.now()};
  return vm.runInNewContext(interactiveLine+'\n'+repeatLine+'\n({interactive,repeated})',context);
}

test('explicit citizen voice compose Google login is not mistaken for an automatic redirect loop',()=>{
  assert.deepEqual(classify('?site=seonammedi&direct=1&purpose=seonammedi-board-write'),{interactive:true,repeated:false});
});
test('existing administrator interactive login remains allowed',()=>{
  assert.deepEqual(classify('?site=seonammedi&purpose=seonammedi-board-admin'),{interactive:true,repeated:false});
});
test('unrelated automatic repeated logins still trigger the security loop guard',()=>{
  assert.deepEqual(classify('?site=portal&direct=1'),{interactive:false,repeated:true});
});
test('ordinary first visit remains allowed and retry guard still preserves original return URL',()=>{
  assert.equal(classify('?site=portal',{previous:0}).repeated,false);
  assert.ok(source.includes('const guardKey = `ekodi-auth-entry:${site}:${returnTo}`'));
  assert.ok(source.includes('new URL(returnTo)'));
  assert.ok(source.includes('location.assign(target)'));
});
