import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../auth-site/auth-entry.js', import.meta.url), 'utf8');
const prologue = source.slice(0, source.indexOf('async function loadAuthRouter()'));
assert.ok(prologue.includes('const repeated = '), 'missing auth loop guard');

function evaluate({ previous=0, now=180000, interactive=false, returnTo='https://ekodi.kr/admin/services/engine-all' }={}) {
  const data = new Map();
  if (previous) data.set(`ekodi-auth-entry:admin:${returnTo}`, String(previous));
  const params = new URLSearchParams({ site:'admin', direct:'1', return_to:returnTo });
  if (interactive) params.set('manage','1');
  const context = {
    URLSearchParams, Date:{ now:()=>now },
    location:{ search:'?'+params.toString() },
    sessionStorage:{ getItem:key=>data.get(key)||null, setItem:(key,value)=>data.set(key,value) },
  };
  return vm.runInNewContext(prologue+'\nrepeated;', context);
}

test('reload-like repeat in two minutes is stopped without bypass',()=>{
  assert.equal(evaluate({previous:179000}),true);
});
test('fresh login entry remains allowed',()=>assert.equal(evaluate({previous:0}),false));
test('expired guard window allows reentry',()=>assert.equal(evaluate({previous:1000}),false));
test('explicit interactive management flow remains allowed',()=>assert.equal(evaluate({previous:179000,interactive:true}),false));
test('repeat guard has an explicit user retry route',()=>{
  assert.match(source,/retry\?\.addEventListener\('click'/);
  assert.match(source,/sessionStorage\.removeItem\(guardKey\)/);
  assert.match(source,/dataset\.authLoopBlocked = '1'/);
});
