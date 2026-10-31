import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
test('edge diagnostics are read-only, two owned fixed URLs and redact loader tokens',async()=>{
  const src=await read('scripts/inspect-seonammedi-edge-jsd.mjs');
  for(const val of [
    "'https://ekodi.kr/seonammedi/'",
    "'https://seonammedi.kr/'",
    "redirect:'error'",
    "method",
    "sha256",
    "redactedShape",
    "replace(/'(?:"
  ].filter(x=>x!=='method'))assert.ok(src.includes(val),val);
  assert.ok(src.includes("token.includes('/cdn-cgi/challenge-platform/scripts/')"));
  assert.ok(src.includes("createHash('sha256').update(body)"));
  assert.doesNotMatch(src,/Authorization:|Bearer |process\.env\.(?:GITHUB_TOKEN|CLOUDFLARE)/);
  assert.doesNotMatch(src,/method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
  assert.ok(!src.includes('console.log(data)')&&!src.includes('console.log(html)'));
});
test('diagnostic workflow requires owner trigger and has read permission only',async()=>{
  const yaml=await read('.github/workflows/seonammedi-edge-jsd-diagnostics.yml');
  assert.ok(yaml.includes('contents: read'));
  assert.ok(yaml.includes('github.event.comment.user.login == github.repository_owner'));
  assert.ok(yaml.includes("github.event.comment.body == 'EKODI-SEONAM-EDGE-DIAG:RUN'"));
  assert.ok(yaml.includes('ref: main'));
  assert.doesNotMatch(yaml,/secrets\.|contents:\s*write|pull-requests:\s*write/);
});
