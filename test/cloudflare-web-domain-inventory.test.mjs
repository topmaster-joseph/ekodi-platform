import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const file=new URL('../scripts/cloudflare-web-domain-inventory.mjs',import.meta.url);
test('Cloudflare domain audit is read-only and flags mail/wildcard ambiguity',()=>{
  const source=readFileSync(file,'utf8');
  const result=execFileSync(process.execPath,[file.pathname,'--self-test'],{encoding:'utf8',timeout:10000});
  assert.match(result,/self-test OK/);
  assert.match(source,/destructiveActions:0/);
  assert.match(source,/emailOrVerificationRecord/);
  assert.match(source,/dnsOnlyUnknownPurpose/);
  assert.doesNotMatch(source,/method\s*:\s*['"`](POST|PUT|PATCH|DELETE)/i);
});
