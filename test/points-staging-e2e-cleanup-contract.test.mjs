import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(
  new URL('../.github/workflows/verify-points-staging-browser.yml',import.meta.url),
  'utf8'
);

function before(a,b,label){
  const i=workflow.indexOf(a),j=workflow.indexOf(b);
  assert.ok(i>=0, label+': first marker missing');
  assert.ok(j>=0, label+': second marker missing');
  assert.ok(i<j,label+': cleanup marker must precede mutation');
}

test('staging browser E2E refuses missing private development key before inserting fixtures',()=>{
  before('case "$key" in sb_secret_*)','echo "FIXTURES_CREATED=1"','key gate');
  assert.match(workflow,/environment: development/);
  assert.match(workflow,/DEV_REF: lxcxwbdwwojjkgybbqii/);
  assert.doesNotMatch(workflow,/renzehysxirjilvdxacv/);
});

test('ephemeral D1 identity and session cleanup identifiers are recorded before writes',()=>{
  before('echo "E2E_D1=$db"','d1 "INSERT INTO admins','D1 database');
  before('echo "E2E_ADMIN_EMAIL=$admin_email"','d1 "INSERT INTO admins','D1 user');
  before('echo "E2E_TOKEN_HASH=$token_hash"','d1 "INSERT INTO sessions','D1 session');
  assert.match(workflow,/name: Revoke ephemeral session, member and fixtures\n\s+if: always\(\)/);
});

test('partial Auth creation is recoverable by a run-scoped member email only',()=>{
  before('echo "E2E_MEMBER_EMAIL=$email"','\n          user="$(jq','Auth identity');
  assert.match(workflow,/if \[ -z "\$\{E2E_MEMBER_ID:-\}" \] && \[ -n "\$\{E2E_MEMBER_EMAIL:-\}" \]/);
  assert.match(workflow,/select id::text from auth\.users where email='\$E2E_MEMBER_EMAIL' limit 1/);
  assert.match(workflow,/if \[\[ "\$\{E2E_MEMBER_ID:-\}" =~ \^\[0-9a-f-\]\{36\}\$ \]\]; then/);
  assert.match(workflow,/DELETE -H "apikey: \$key"/);
});

test('nothing allows synthetic credentials or records to escape the development E2E lane',()=>{
  assert.match(workflow,/on:\n  workflow_dispatch:/);
  assert.match(workflow,/POINTS_E2E_SITE: e2e-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow,/EKODI_BROWSER_ENVIRONMENT: development/);
});
