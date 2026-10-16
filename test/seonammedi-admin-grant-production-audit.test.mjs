import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const workflow=readFileSync(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8');
const runner=new URL('../scripts/verify-seonammedi-admin-grant-output.mjs',import.meta.url).pathname;
function run(payload){
  const dir=mkdtempSync(path.join(tmpdir(),'ekodi-board-grant-'));
  const file=path.join(dir,'result.json');
  writeFileSync(file,typeof payload==='string'?payload:JSON.stringify(payload));
  const out=spawnSync(process.execPath,[runner,file],{encoding:'utf8'});
  rmSync(dir,{recursive:true,force:true});
  return out;
}
test('canonical D1 grant audit recognizes only one explicit verified scope',()=>{
  const good=run([{success:true,results:[{scoped_grant_verified:1}]}]);
  assert.equal(good.status,0);
  assert.match(good.stdout,/SEONAMMEDI_BOARD_ADMIN_GRANT=VERIFIED/);
  assert.doesNotMatch(good.stdout,/linuxceo|gmail|token|capabilities/);
  for(const bad of [
    [{success:true,results:[{scoped_grant_verified:0}]}],
    [{success:false,results:[{scoped_grant_verified:1}]}],
    [{success:true,results:[{scoped_grant_verified:1},{scoped_grant_verified:1}]}],
    'not-json'
  ]){
    const result=run(bad);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/UNVERIFIED/);
  }
});
test('Control API checks canonical ekodi-auth read-only grant after guarded migrations',()=>{
  const migration=workflow.indexOf('name: Apply production migrations after isolated staging success');
  const audit=workflow.indexOf('name: Audit SeonamMedi limited board-admin grant in canonical D1 (read only)');
  const promote=workflow.indexOf('name: Guarded 0-percent Control candidate then promote');
  assert.ok(migration>=0&&migration<audit&&audit<promote);
  const section=workflow.slice(audit,promote);
  for(const required of ['d1 execute ekodi-auth --remote','--json --command "$sql"','scoped_grant_verified','seonammedi.notice.manage','seonammedi.voice.manage','platform.admin','role=\'board_admin\'','scripts/verify-seonammedi-admin-grant-output.mjs','UNVERIFIED in canonical D1']){
    assert.ok(section.includes(required),required);
  }
  assert.match(section,/SELECT CASE WHEN COUNT\(\*\)=1/);
  assert.doesNotMatch(section,/^\s+(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/m);
  assert.match(section,/actual Google login and PUT\/DELETE remain separately unverified/);
});
