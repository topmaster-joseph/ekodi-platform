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

test('Pages inventory uses plain first GET and bounded 20-item continuation without false completeness',()=>{
  const source=readFileSync(file,'utf8');
  assert.match(source,/function inventoryPageRequest\(endpoint,page\)/);
  assert.match(source,/const perPage=pagesProjects\?20:100/);
  assert.match(source,/if\(pagesProjects&&page===1\)return\{url:endpoint,perPage\}/);
  assert.match(source,/if\(knownPages&&page>=count\)return all/);
  assert.match(source,/if\(!knownPages&&data\.result\.length<request\.perPage\)return all/);
  assert.match(source,/throw new Error\('Inventory pagination exceeded 30 pages'\)/);
  assert.doesNotMatch(source,/method\s*:\s*['"`](POST|PUT|PATCH|DELETE)/i);
});
