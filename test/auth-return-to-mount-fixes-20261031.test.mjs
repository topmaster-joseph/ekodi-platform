import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

// Rebuild the hub's return-URL guard from source so the test exercises the real logic.
async function marketingSafeReturn(){
  const src=await read('auth-site/marketing-auth-hotfix.js');
  const pick=re=>{const m=src.match(re);assert.ok(m,'missing '+re);return m[0]};
  const body=[
    pick(/const returnOrigins=new Set\([^\n]+\);/),
    pick(/const isMarketingOrigin=[^\n]+;/),
    pick(/const isMarketingApexPath=[^\n]+;/),
    pick(/const safeReturn=[^\n]+;/),
    'return safeReturn;'
  ].join('\n');
  return new Function(body)();
}

test('marketing hub returns to the canonical apex mount, never the whole apex',async()=>{
  const safeReturn=await marketingSafeReturn();
  const fallback='https://marketing.ekodi.kr/';
  // Fixed: the canonical apex path now round-trips exactly.
  assert.equal(safeReturn('https://ekodi.kr/ekodibiz/marketing-ai'),'https://ekodi.kr/ekodibiz/marketing-ai');
  assert.equal(safeReturn('https://ekodi.kr/ekodibiz/marketing-ai/studio?tab=2'),'https://ekodi.kr/ekodibiz/marketing-ai/studio?tab=2');
  // Unchanged behaviour for the existing marketing origins.
  assert.equal(safeReturn('https://jadam.ekodi.kr/x'),'https://jadam.ekodi.kr/x');
  assert.equal(safeReturn('https://shop1.ai.ekodi.kr/'),'https://shop1.ai.ekodi.kr/');
  // Still rejected: other apex paths, look-alike prefixes, other hosts, credentials, http.
  for(const bad of [
    'https://ekodi.kr/admin/','https://ekodi.kr/','https://ekodi.kr/ekodibiz/marketing-ai-evil',
    'https://ekodi.kr.evil.com/ekodibiz/marketing-ai','https://evil.com/ekodibiz/marketing-ai',
    'https://user:pw@ekodi.kr/ekodibiz/marketing-ai','http://ekodi.kr/ekodibiz/marketing-ai',
    'javascript:alert(1)','//evil.com','not a url'
  ])assert.equal(safeReturn(bad),fallback,bad);
});

test('access-api already accepts the same apex mount for marketing handoff',async()=>{
  const api=await read('supabase/functions/access-api/index.ts');
  assert.match(api,/marketing:\["\/ekodibiz\/marketing-ai"\]/);
});

test('seonammedi notice-compose logins return to the site mount, not the apex root',async()=>{
  const app=await read('sites/seonammedi/public/app.js');
  assert.match(app,/function noticeLoginUrl\(\)\{[^}]*return_to',siteMountBase\(\)\+'\?compose=notice#notices'\)/);
  assert.doesNotMatch(app,/return_to',location\.origin\+'\/\?compose=notice/);
  const notices=await read('sites/seonammedi/public/notices/index.html');
  assert.match(notices,/location\.pathname\.startsWith\('\/seonammedi'\)\?'\/seonammedi':''\)\+'\/notices\/\?compose=1'/);
  // Behavioural check of the mount expression on both mounts.
  const ret=(origin,path)=>origin+(path.startsWith('/seonammedi')?'/seonammedi':'')+'/notices/?compose=1';
  assert.equal(ret('https://ekodi.kr','/seonammedi/notices/'),'https://ekodi.kr/seonammedi/notices/?compose=1');
  assert.equal(ret('https://seonammedi.kr','/notices/'),'https://seonammedi.kr/notices/?compose=1');
});
