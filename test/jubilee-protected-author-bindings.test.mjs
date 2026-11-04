import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateJubileeAuthorBindings as validate} from '../scripts/validate-jubilee-author-credentials.mjs';

const owner='65602d0d-a5f7-42d2-9827-fa20c5b39da2';
const aliases=[
 {userId:'02e915c2-d354-48bc-b5b7-4a3adccb9230',email:'primary-alt@example.com'},
 {userId:'99f3fb61-8f0b-49f7-b057-a5b583bc2154',email:'secondary-alt@example.com'},
];

test('private author binding uses exactly one owner and two distinct identity proofs',()=>{
  const ok=validate(owner,JSON.stringify(aliases));
  assert.equal(ok.owner,owner);
  assert.equal(ok.aliases.length,2);
});

test('missing, malformed, duplicate, or privilege-bearing author bindings fail closed',()=>{
  const bad=[
    ['',JSON.stringify(aliases)],
    ['invalid-owner',JSON.stringify(aliases)],
    [owner,'{'],
    [owner,'[]'],
    [owner,JSON.stringify(aliases.slice(0,1))],
    [owner,JSON.stringify([...aliases,{userId:owner,email:'duplicate@example.com'}])],
    [owner,JSON.stringify([{...aliases[0],userId:owner},aliases[1]])],
    [owner,JSON.stringify([aliases[0],{...aliases[1],email:aliases[0].email}])],
    [owner,JSON.stringify([aliases[0],{...aliases[1],role:'admin'}])],
    [owner,JSON.stringify([aliases[0],{...aliases[1],email:'SPOOF@example.com'}])],
  ];
  for(const [o,a] of bad)assert.throws(()=>validate(o,a));
});

test('binding activation is main-only, protected, secret-scoped and publication-safe',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/publishing-jubilee-author-bindings.yml',import.meta.url),'utf8');
  assert.match(workflow,/branches:\s*\[main\]/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/EKODI_RELEASE_BRANCH_REF:.*inputs\.release_branch_ref/);
  assert.match(workflow,/EKODI_RELEASE_TASK_ID:.*inputs\.release_task_id/);
  assert.doesNotMatch(workflow,/pull_request:/);
  assert.match(workflow,/validate-ekodi-ai-change-orchestration\.mjs --release/);
  assert.match(workflow,/wrangler@4\.119\.0 secret bulk/);
  assert.match(workflow,/wrangler@4\.119\.0 secret list/);
  assert.match(workflow,/secrets\.PUBLISHING_JUBILEE_AUTHOR_USER_ID/);
  assert.match(workflow,/secrets\.PUBLISHING_JUBILEE_AUTHOR_ALIASES/);
  assert.match(workflow,/saleActivationEnabled!==false/);
  assert.match(workflow,/test "\$code" = "401"/);
  assert.doesNotMatch(workflow,/\b(?:SECRET_FILE|secret_file)\b.*cat\b/);
});
