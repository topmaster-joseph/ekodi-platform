import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const opsPath=path.join(root,'my','church-meeting-ops.js');
const entryPath=path.join(root,'my','church-marketing-ai.js');
const ops=fs.readFileSync(opsPath,'utf8');
const entry=fs.readFileSync(entryPath,'utf8');

test('church meeting ops is wired into My EKODI',()=>{
  assert.match(entry,/church-meeting-ops\.js/);
  assert.match(ops,/EKODI_MY_AUTH/);
  assert.match(ops,/\/api\/church\/admin\/reports/);
  assert.match(ops,/church_services/);
  assert.match(ops,/ekodi\.kr\/ekodichurch\/live\//);
});

test('church meeting ops prepares bulletin, presentation, homepage and live outputs',()=>{
  assert.match(ops,/bulletinHtml/);
  assert.match(ops,/PptxGenJS/);
  assert.match(ops,/buildHomepage/);
  assert.match(ops,/buildLive/);
  assert.match(ops,/data-cmo-action="all"/);
});

test('church meeting ops contains no privileged server secret',()=>{
  assert.doesNotMatch(ops,/service_role|sb_secret_|SUPABASE_SERVICE/i);
});

test('church meeting ops parses as JavaScript',()=>{
  const result=spawnSync(process.execPath,['--check',opsPath],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
