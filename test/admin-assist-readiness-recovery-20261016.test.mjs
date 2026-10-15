import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../scripts/admin-assist-canonical-e2e.mjs',import.meta.url),'utf8');

test('canonical Admin home retry is bounded and does not re-enter OAuth or bypass session check',()=>{
  const start=src.indexOf("console.log('[ASSIST-E2E] verify canonical light conversation home')");
  const end=src.indexOf("await page.waitForFunction(() => (",start);
  assert.ok(start>=0 && end>start);
  const code=src.slice(start,end);
  assert.match(code,/attempt\s*=\s*1;\s*attempt\s*<=\s*2;/);
  assert.match(code,/page\.goto\(canonicalBaseUrl/);
  assert.doesNotMatch(code,/page\.goto\(authEntryUrl/);
  assert.match(code,/sessionStorage\.getItem\('ekodi-auth-token'\)/);
  assert.match(code,/document\.querySelector\('#apiState'\)\?\.textContent\?\.includes\('정상'\)/);
  assert.match(code,/attempt === 2 \|\| \[401, 403\]\.includes\(status\) \|\| state\.path !== '\/admin\/'/);
});
test('failed canonical HTML response reports only redacted readiness state',()=>{
  const start=src.indexOf("console.log('[ASSIST-E2E] verify canonical light conversation home')");
  const end=src.indexOf("await page.waitForFunction(() => (",start);
  const code=src.slice(start,end);
  for(const field of ['path: location.pathname','hasApp:','hasLogin:','hasCore:','hasSession:','status,contentType']) assert.ok(code.includes(field),field);
  assert.doesNotMatch(code,/console\.(?:log|error)\([^\n]*(?:location\.href|authEntryUrl|response\.body|token\b)/);
});
test('Assist API reply, render and history checks remain required',()=>{
  assert.ok(src.includes("page.waitForResponse(response =>"));
  assert.ok(src.includes("replyLength = reply.length"));
  assert.ok(src.includes("report.historyVerified = true"));
  assert.ok(src.includes("report.renderedReplyLength ="));
  assert.ok(src.includes("report.passed = true"));
});
