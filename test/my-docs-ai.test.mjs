import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const html=read('my/docs/index.html');
const js=read('my/docs/docs.js');
const worker=read('my-worker.js');
const migration=read('supabase/migrations/20260907113000_document_workspace_ai.sql');
const ai=read('supabase/functions/document-ai-api/index.ts');
const manifest=JSON.parse(read('deploy/manifests/my.worker.json'));

test('Docs AI exposes a human-controlled editable workspace',()=>{
  assert.match(html,/contenteditable="true"/);
  assert.match(html,/id="aiPreview"/);
  assert.match(html,/id="applyAi"/);
  assert.match(html,/AI는 바로 덮어쓰지 않습니다/);
  assert.match(html,/data-export="docx"/);
  assert.match(html,/HWPX/);
});

test('document client keeps auth, sanitization and storage boundaries explicit',()=>{
  assert.match(js,/document_files/);
  assert.match(js,/document_versions/);
  assert.match(js,/personal:\$\{session\.user\.id\}/);
  assert.match(js,/script,style,iframe,object,embed,form,input,button,meta,link/);
  assert.match(js,/mammoth@1\.9\.1/);
  assert.match(js,/docx@8\.5\.0/);
  assert.match(js,/document-ai-api/);
});

test('private document schema is owner-scoped and usage writes stay server-side',()=>{
  assert.match(migration,/alter table public\.document_files enable row level security/i);
  assert.match(migration,/auth\.uid\(\) = owner_user_id/);
  assert.match(migration,/workspace_key = \('personal:' \|\| auth\.uid\(\)::text\)/);
  assert.match(migration,/revoke insert, update, delete on public\.document_ai_usage from anon, authenticated/i);
});

test('document AI is authenticated, provider-resilient and bounded',()=>{
  assert.match(ai,/authentication_required/);
  assert.match(ai,/DAILY_LIMIT/);
  assert.match(ai,/GEMINI_API_KEY/);
  assert.match(ai,/OPENAI_API_KEY/);
  assert.match(ai,/store:false/);
  assert.match(ai,/사용자가 제공하지 않은 사실/);
});

test('My EKODI advertises and probes the document workspace in production',()=>{
  assert.match(worker,/documentWorkspace:true/);
  assert.match(worker,/documentCapability:'core\.documents'/);
  assert.match(worker,/url\.pathname==='\/docs'/);
  const docsProbe=manifest.worker.requests.find(item=>item.url==='https://my.ekodi.kr/docs/');
  assert.ok(docsProbe);
  assert.ok(docsProbe.expect.includes('EKODI Docs AI'));
});