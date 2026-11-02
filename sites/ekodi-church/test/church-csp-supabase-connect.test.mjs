import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const headers=await readFile(new URL('../_headers',import.meta.url),'utf8');

test('Church mounted pages may query their one canonical Supabase project',()=>{
  const csp=headers.match(/Content-Security-Policy:\s*([^\n]+)/)?.[1];
  assert.ok(csp,'Church Pages must publish an enforceable CSP');
  const connect=csp.match(/connect-src\s+([^;]+)/)?.[1]||'';
  assert.match(connect,/^'self' https:\/\/api\.ekodi\.kr https:\/\/renzehysxirjilvdxacv\.supabase\.co$/);
  assert.doesNotMatch(connect,/https:\/\/\*|https:\/\/\*\.supabase|unsafe-inline|unsafe-eval/);
});

test('CSP relaxation is connection-only and preserves all other protections',()=>{
  const csp=headers.match(/Content-Security-Policy:\s*([^\n]+)/)?.[1]||'';
  assert.match(csp,/script-src 'self'/);
  assert.match(csp,/object-src 'none'/);
  assert.match(csp,/frame-ancestors 'none'/);
  assert.match(csp,/base-uri 'self'/);
  assert.match(csp,/form-action 'self'/);
  assert.match(csp,/default-src 'self'/);
});
