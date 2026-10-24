import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {buildLedger,parseRow} from '../scripts/record-post-promotion-verification.mjs';

const workflow=fs.readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
const GATE="!cancelled() && steps.promote.outcome == 'success'";

function deploySteps(){
  const start=workflow.indexOf('      - name: Candidate at 0%, verify routes, promote and auto-rollback on failure');
  const end=workflow.indexOf('\n  native_surface_verification_desktop:');
  assert.ok(start>0&&end>start);
  return workflow.slice(start,end).split('\n      - name: ').slice(1).map(b=>({
    name:b.split('\n')[0],
    id:(b.match(/\n        id: (\S+)/)||[])[1],
    cond:(b.match(/\n        if: (.*)/)||[])[1]||'',
  }));
}

test('promotion step carries an id so later checks gate on it',()=>{
  assert.match(workflow,/promote and auto-rollback on failure\n        id: promote\n/);
});

test('every post-promotion check is gated on promotion only, not on earlier checks',()=>{
  const checks=deploySteps().filter(s=>s.id&&s.id.startsWith('v_'));
  assert.equal(checks.length,14);
  for(const s of checks){
    assert.ok(s.cond.includes(GATE),`${s.name} must run when promotion succeeded even if a sibling check failed`);
    assert.doesNotMatch(s.cond,/always\(\)/,`${s.name} must not run after cancellation or failed promotion`);
  }
  assert.doesNotMatch(workflow.slice(workflow.indexOf('id: promote')),/continue-on-error/,'failures must stay failures');
});

test('quota guard is preserved on the checks that had it',()=>{
  const byId=Object.fromEntries(deploySteps().map(s=>[s.id,s.cond]));
  for(const id of ['v_seonammedi_release','v_seonammedi_release_subpath','v_seonammedi_edge_cache','v_turnstile','v_mission','v_mall','v_admin_route','v_device_admin','v_ai_provider','v_independent_board','v_service_links']){
    assert.match(byId[id],/steps\.quota\.outputs\.skip_nonessential != 'true'/,id);
  }
  for(const id of ['v_seonammedi_finance','v_seonammedi_board_urls','v_write_queue_consumer']){
    assert.doesNotMatch(byId[id],/skip_nonessential/,`${id} is a required boundary and must never be quota-skipped`);
  }
});

test('ledger lists every check and runs after any outcome of a promoted release',()=>{
  const ledger=deploySteps().find(s=>s.id==='verification_ledger');
  assert.ok(ledger);
  assert.equal(ledger.cond,"${{ always() && steps.promote.outcome == 'success' }}");
  for(const s of deploySteps().filter(x=>x.id&&x.id.startsWith('v_'))){
    assert.ok(workflow.includes(`|${s.id}|\${{ steps.${s.id}.outcome }}'`),`ledger row missing for ${s.id}`);
  }
  assert.match(workflow,/shared-site-post-promotion-verification-\$\{\{ github\.run_id \}\}/);
});

test('ledger isolates sites and blocks on any failure',()=>{
  const l=buildLedger(['seonammedi|release-convergence|v_a|failure','seonammedi|public-finance-boundary|v_b|success','ekodimall|canonical-address|v_c|success','admin|route-ownership|v_d|skipped'],{releaseSha:'abc',generatedAt:'t'});
  assert.equal(l.blocking,true);
  assert.deepEqual(l.failedChecks,['seonammedi/release-convergence']);
  assert.equal(l.sites.seonammedi.status,'failed');
  assert.equal(l.sites.seonammedi.passed,1);
  assert.equal(l.sites.ekodimall.status,'passed');
  assert.equal(l.sites.admin.status,'skipped');
  assert.equal(l.releaseSha,'abc');
});

test('ledger fails closed on cancelled, empty, unknown or malformed input',()=>{
  for(const o of ['cancelled','','weird'])assert.equal(parseRow(`x|y|v_z|${o}`).status,'failed');
  assert.throws(()=>parseRow('x|y|v_z'),/malformed/);
  assert.throws(()=>parseRow('X Y|y|v_z|success'),/malformed/);
  assert.throws(()=>buildLedger([]),/no_verification_rows/);
  assert.throws(()=>buildLedger(['a|b|v_1|success','a|c|v_1|success']),/duplicate/);
  assert.equal(buildLedger(['a|b|v_1|success','a|c|v_2|skipped']).blocking,false);
});

test('CLI writes evidence and summary, exits non-zero only when blocking',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ppv-'));
  const out=path.join(dir,'e.json'), summary=path.join(dir,'s.md');
  const run=rows=>{try{execFileSync('node',['scripts/record-post-promotion-verification.mjs',`--out=${out}`,'--',...rows],{env:{...process.env,GITHUB_STEP_SUMMARY:summary,RELEASE_SHA:'deadbeef'},stdio:'pipe'});return 0}catch(e){return e.status}};
  assert.equal(run(['seonammedi|release-convergence|v_a|success']),0);
  assert.equal(JSON.parse(fs.readFileSync(out,'utf8')).releaseSha,'deadbeef');
  assert.equal(run(['seonammedi|release-convergence|v_a|failure','ekodimall|canonical-address|v_b|success']),1);
  const e=JSON.parse(fs.readFileSync(out,'utf8'));
  assert.equal(e.sites.ekodimall.status,'passed');
  assert.match(fs.readFileSync(summary,'utf8'),/\| seonammedi \| release-convergence \| v_a \| ❌ failure \|/);
});

test('both SeonamMedi origins are verified and recorded independently',()=>{
  const steps=deploySteps();
  const a=steps.find(s=>s.id==='v_seonammedi_release'), b=steps.find(s=>s.id==='v_seonammedi_release_subpath');
  assert.ok(a&&b);
  assert.match(workflow,/id: v_seonammedi_release\n[^\n]*\n        run: [^\n]*--origin=https:\/\/seonammedi\.kr /);
  assert.match(workflow,/id: v_seonammedi_release_subpath\n[^\n]*\n        run: [^\n]*--origin=https:\/\/ekodi\.kr\/seonammedi /);
  assert.match(workflow,/'seonammedi-kr\|release-convergence\|v_seonammedi_release\|/);
  assert.match(workflow,/'seonammedi-ekodi-subpath\|release-convergence\|v_seonammedi_release_subpath\|/);
});
