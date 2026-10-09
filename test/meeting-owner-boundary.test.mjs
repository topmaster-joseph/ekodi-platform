import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {workspaceAdminCanAccess} from '../workspace-admin-page.js';
import {churchPastorCanAccess,churchPastorAdminScript} from '../church-pastor-admin-page.js';
import {workspaceAdminCss} from '../workspace-admin-page.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mission=fs.readFileSync(path.join(root,'workspace-admin-page.js'),'utf8');
const church=fs.readFileSync(path.join(root,'church-pastor-admin-page.js'),'utf8');
const my=fs.readFileSync(path.join(root,'my/church-meeting-ops.js'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261009193000_split_mission_church_meeting_ownership.sql'),'utf8');

test('mission saturday is a tenant-local authenticated administrator section',()=>{
  assert.match(mission,/\['saturday','토요모임'\]/);
  assert.match(mission,/if\(workspace==='ekodimission'\).*dedicated\.add\('saturday'\)/);
  assert.match(mission,/if\(section==='saturday'\)return saturdayMeeting\(\)/);
  assert.match(mission,/workspace!=='ekodimission'/);
  assert.equal(workspaceAdminCanAccess('tenant_admin','saturday'),true);
  assert.equal(workspaceAdminCanAccess('viewer','saturday'),false);
});
test('mission saturday form only reads and saves saturday records',()=>{
  assert.match(mission,/service_type=eq\.saturday/);
  assert.match(mission,/service_type:'saturday'/);
  assert.match(mission,/getUTCDay\(\)!==6/);
  assert.match(mission,/publishing&&\(!String\(values\.scripture/);
  assert.match(mission,/workspaceRole==='tenant_admin'/);
});
test('church pastor worship is Sunday-only with original passage required before publication',()=>{
  assert.match(church,/service_type=eq\.sunday/);
  assert.match(church,/service_type:'sunday'/);
  assert.match(church,/getUTCDay\(\)!==0/);
  assert.match(church,/published&&\(!String\(data\.scripture/);
  assert.equal(churchPastorCanAccess('senior_pastor','worship'),true);
});
test('My EKODI church meeting panel cannot write saturday; historic rows are not deleted',()=>{
  assert.match(my,/item\.kind==='sunday'/);
  assert.match(my,/pack\.kind!=='sunday'/);
  assert.doesNotMatch(my,/state\.services=\[sunday,saturday\]/);
  assert.doesNotMatch(sql,/DELETE FROM public\.church_worship_materials/i);
});
test('database RLS separates write policies by tenant and service_type, preserving public published reads',()=>{
  assert.match(sql,/site_key='mission'/);
  assert.match(sql,/site_key='church'/);
  assert.match(sql,/service_type='saturday'/);
  assert.match(sql,/service_type='sunday'/);
  assert.match(sql,/published worship visible to signed-in/);
  assert.match(sql,/WITH CHECK \(service_type='saturday'/);
  assert.match(sql,/WITH CHECK \(service_type='sunday'/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
});
test('both administration scripts pass syntax check',()=>{
  for(const file of ['workspace-admin-page.js','church-pastor-admin-page.js','my/church-meeting-ops.js']){
    const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
    assert.equal(result.status,0,file+': '+result.stderr);
  }
});

test('church client provides esbuild helper before serializing the pastor runtime',async()=>{
  const script=await (await churchPastorAdminScript()).text();
  assert.match(script,/const __name=\(target,value\)=>Object\.defineProperty/);
  assert.ok(script.indexOf('const __name=')<script.indexOf('const section='),'helper must be declared before runtime initializes');
});
test('tenant admin sidebar uses readable contrast and compact rows when common shell is active',async()=>{
  const css=await (await workspaceAdminCss()).text();
  assert.match(css,/\.ekodi-admin-shell-sidebar\.sidebar \[data-ekodi-admin-nav\] :is\(a,button\)\{color:#273244!important/);
  assert.match(css,/\.ekodi-admin-shell-sidebar\.sidebar #adminNav\{align-content:start!important/);
  assert.match(css,/\.admin-nav-accordion\{align-content:start!important/);
});
