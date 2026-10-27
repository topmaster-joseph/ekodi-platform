import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const reg=JSON.parse(await read('config/singles-feature-flags.json'));
const names=new Set(reg.flags.map(f=>f.name));
const flagsIn=src=>new Set([...src.matchAll(/SINGLES_[A-Z0-9_]+_ENABLED/g)].map(m=>m[0]));
const worker=await read('singles-surface.js');
let edge='';for(const f of await readdir(new URL('../supabase/functions/singles-api/',import.meta.url)))if(f.endsWith('.ts'))edge+=await read('supabase/functions/singles-api/'+f);

test('every switch read by code is registered, and every registered switch is read where the registry says',()=>{
  const w=flagsIn(worker),e=flagsIn(edge);
  for(const f of [...w,...e])assert.ok(names.has(f),f+' missing from config/singles-feature-flags.json');
  for(const f of reg.flags){
    assert.equal(w.has(f.name),f.layer.includes('worker'),f.name+' worker layer mismatch');
    assert.equal(e.has(f.name),f.layer.includes('edge'),f.name+' edge layer mismatch');
  }
});
test('production worker config keeps every member-facing switch off before launch',async()=>{
  const toml=await read('wrangler.site.toml');
  for(const f of reg.flags.filter(f=>f.layer.includes('worker')&&f.default==='false')){
    const m=toml.match(new RegExp(f.name+'\\s*=\\s*"([^"]*)"'));
    assert.ok(m,f.name+' not set in wrangler.site.toml');
    // A switch may be "true" in production only when the registry records an owner launch decision.
    const expected=f.production==='true'&&f.launchedAt&&f.launchDecision?'true':'false';
    assert.equal(m[1],expected,f.name+(expected==='true'?' was launched and must stay "true"':' must stay "false" until the launch gates pass'));
  }
});
test('docs mention only registered switch names',async()=>{
  for(const d of (await readdir(new URL('../docs/',import.meta.url))).filter(d=>d.startsWith('EKODI-SINGLES-'))){
    const text=await read('docs/'+d);
    for(const f of flagsIn(text))assert.ok(names.has(f)||(reg.retired_names.includes(f)&&/폐기|retired/.test(text)),d+' mentions unknown switch '+f);
  }
});
test('launch-gate checklist covers every MVP contract gate and stays linked',async()=>{
  const gates=JSON.parse(await read('config/singles-mvp-contract.json')).gates;
  const doc=await read('docs/EKODI-SINGLES-LAUNCH-GATES.md');
  for(const g of gates)assert.ok(doc.includes(g),'gate '+g+' missing from launch checklist');
  assert.match(await read('docs/EKODI-SINGLES-CONSENT-REVIEW.md'),/docs\/EKODI-SINGLES-LAUNCH-GATES\.md/);
});
