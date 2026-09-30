import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const opsPath=path.join(root,'my','church-meeting-ops.js');
const entryPath=path.join(root,'my','church-marketing-ai.js');
const migrationPath=path.join(root,'supabase','migrations','20260913014000_church_worship_materials.sql');
const ops=fs.readFileSync(opsPath,'utf8');
const entry=fs.readFileSync(entryPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');

test('church worship ops is wired into My EKODI',()=>{
  assert.match(entry,/church-meeting-ops\.js/);
  assert.match(ops,/EKODI_MY_AUTH/);
  assert.match(ops,/\/api\/church\/admin\/reports/);
  assert.match(ops,/church_services/);
  assert.match(ops,/ekodi\.kr\/ekodichurch\/mypage\//);
  assert.match(ops,/ekodi\.kr\/ekodichurch\/live\//);
});

test('church worship ops prepares all required outputs',()=>{
  assert.match(ops,/bulletinHtml/);
  assert.match(ops,/PptxGenJS/);
  assert.match(ops,/buildHomepage/);
  assert.match(ops,/buildLive/);
  assert.match(ops,/data-cmo-action="all"/);
  assert.match(ops,/data-cmo-action="homepage"/);
  assert.match(ops,/church_worship_materials/);
  assert.match(ops,/resolution=merge-duplicates/);
});

test('My EKODI hands the same draft to the church console',()=>{
  assert.match(ops,/ekodi:church:worship:/);
  assert.match(ops,/consolePayload/);
  assert.match(ops,/serviceName/);
});

test('live studio receives worship metadata',()=>{
  assert.match(ops,/mode:'studio'/);
  assert.match(ops,/service:label\(pack\.kind\)/);
  assert.match(ops,/scripture:pack\.scripture/);
  assert.match(ops,/preacher:pack\.preacher/);
});

test('worship publication migration enforces public-published and church-admin write boundaries',()=>{
  assert.match(migration,/published worship is public/);
  assert.match(migration,/is_published = true/);
  assert.match(migration,/site_key='church'/);
  assert.match(migration,/role::text='tenant_admin'/);
  assert.match(migration,/enable row level security/);
});

test('client files contain no privileged server secret',()=>{
  assert.doesNotMatch(ops,/service_role|sb_secret_|SUPABASE_SERVICE/i);
  assert.doesNotMatch(entry,/service_role|sb_secret_|SUPABASE_SERVICE/i);
});

test('church worship ops parses as JavaScript',()=>{
  const result=spawnSync(process.execPath,['--check',opsPath],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
