import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../scripts/admin-assist-canonical-e2e.mjs',import.meta.url),'utf8');
const match=source.match(/report\.visualState = await page\.evaluate\(\(\) => \{([\s\S]*?)\n  \}\);/);
assert.ok(match,'production Assist visual-state evaluator must be present');

function inspect({contextDisplay=null,commandDisplay=null}={}){
  const nodes={
    '.admin-context-tabs-shell':contextDisplay===null?null:{display:contextDisplay},
    '.admin-command-entry':commandDisplay===null?null:{display:commandDisplay},
  };
  const css=(node)=>({display:node?.display||'block',colorScheme:'light',backgroundColor:'rgb(255, 255, 255)',backgroundImage:'radial-gradient(circle, white, gray)',borderRadius:'30px'});
  const document={body:{},querySelector(selector){return nodes[selector]??null}};
  const evaluate=vm.runInNewContext('(function(){'+match[1]+'})',{document,getComputedStyle:css});
  return evaluate();
}

test('removed redundant navigation nodes are treated as hidden',()=>{
  const state=inspect();
  assert.equal(state.contextTabsPresent,false);
  assert.equal(state.commandEntryPresent,false);
  assert.equal(state.contextTabsDisplay,'none');
  assert.equal(state.commandEntryDisplay,'none');
});
test('explicit display none remains hidden',()=>{
  const state=inspect({contextDisplay:'none',commandDisplay:'none'});
  assert.equal(state.contextTabsPresent,true);
  assert.equal(state.commandEntryPresent,true);
  assert.equal(state.contextTabsDisplay,'none');
  assert.equal(state.commandEntryDisplay,'none');
});
test('visible navigation nodes remain detectable as regression',()=>{
  const state=inspect({contextDisplay:'flex',commandDisplay:'block'});
  assert.equal(state.contextTabsDisplay,'flex');
  assert.equal(state.commandEntryDisplay,'block');
  assert.notEqual(state.contextTabsDisplay,'none');
  assert.notEqual(state.commandEntryDisplay,'none');
});
test('Assist E2E still requires hidden chrome, authenticated session, and API reply',()=>{
  assert.ok(source.includes("visual?.contextTabsDisplay !== 'none' || visual?.commandEntryDisplay !== 'none'"));
  assert.ok(source.includes("sessionStorage.getItem('ekodi-auth-token')"));
  assert.ok(source.includes('apiRequestVerified'));
  assert.ok(source.includes('visualContractVerified'));
});
