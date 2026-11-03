import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const file=readFileSync(new URL('../auth-site/auth-entry.js',import.meta.url),'utf8');
const header=file.slice(0,file.indexOf('async function loadAuthRouter()'));
const query='?site=mission&return_to=https%3A%2F%2Fekodi.kr%2Fekodimission%2F';
function storage(){
  const values=new Map();
  return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
}
function visit(store,time,{search=query,type='navigate'}={}){
  const context={URLSearchParams,Date:{now:()=>time},location:{search},
    performance:{getEntriesByType:()=>[{type}]},sessionStorage:store};
  return runInNewContext(header+'\nrepeated;',context);
}

test('mission login allows second visit but blocks third rapid handoff',()=>{
  const s=storage();
  assert.equal(visit(s,100000),false);
  assert.equal(visit(s,103000),false);
  assert.equal(visit(s,105000),true);
});

test('manual reload and time expiry reset the loop guard',()=>{
  const s=storage();
  assert.equal(visit(s,100000),false);
  assert.equal(visit(s,102000),false);
  assert.equal(visit(s,103000,{type:'reload'}),false);
  assert.equal(visit(s,104000),false);
  assert.equal(visit(s,120000),false);
});

test('legacy numeric state and a separate return URL never cause a false block',()=>{
  const s=storage();
  s.setItem('ekodi-auth-entry:mission:https://ekodi.kr/ekodimission/','100000');
  assert.equal(visit(s,101000),false);
  assert.equal(visit(s,102000,{search:'?site=mission&return_to=https%3A%2F%2Fekodi.kr%2Fekodimission%2Fhistory'}),false);
});
