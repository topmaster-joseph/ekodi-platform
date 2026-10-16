import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const adminFile=new URL('../sites/seonammedi/public/admin/admin.js',import.meta.url);

test('SeonamMedi administrator script parses before protected production deployment',()=>{
  const result=spawnSync(process.execPath,['--check',adminFile.pathname],{
    encoding:'utf8',timeout:15000,windowsHide:true
  });
  assert.equal(result.error,undefined,'failed to execute JavaScript syntax check');
  assert.equal(result.status,0,'administrator bundle has a syntax error: '+String(result.stderr||'').slice(0,600));
  const code=readFileSync(adminFile,'utf8');
  assert.ok(code.includes("'내부합계 · 수입 '+moneyText(income)+' · 지출 '"),
    'finance summary must concatenate values outside the string literal');
});
