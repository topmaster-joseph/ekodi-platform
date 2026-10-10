import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync(new URL('../workspace-admin-page.js', import.meta.url), 'utf8');

test('OAuth return status is only confirmed when tenant scoped API has an active matching connection', () => {
  const match=admin.match(/const oauthProviderConfirmed=([^;]+);/);
  assert.ok(match, 'must define pure server-confirmation predicate');
  const confirmed=Function('return ('+match[1]+')')();
  assert.equal(confirmed(null,'youtube'),false);
  assert.equal(confirmed([],'youtube'),false);
  assert.equal(confirmed([{provider:'youtube',status:'pending'}],'youtube'),false);
  assert.equal(confirmed([{provider:'meta',status:'active'}],'youtube'),false);
  assert.equal(confirmed([{provider:'youtube',status:'active'}],'youtube'),true);
  assert.equal(confirmed([{provider:'youtube',status:'revoked'}],'youtube'),false);
  assert.equal(confirmed([{provider:'meta',status:'active'}],'meta'),true);
});

test('callback and initial page landing never claim success without live server connection',()=>{
  assert.ok(admin.includes("const liveConnections=await channel().catch(()=>null)"));
  assert.ok(admin.includes("const verified=oauthProviderConfirmed(liveConnections,result.provider)"));
  assert.ok(admin.includes("const ok=result.status==='success'&&verified"));
  assert.ok(admin.includes("notice.status==='success'&&oauthProviderConfirmed(activeConnections,notice.provider)"));
  assert.ok(admin.includes('return activeConnections;'));
  assert.ok(admin.includes('인증 복귀는 확인됐지만 서버 연결은 아직 확인되지 않았습니다.'));
  assert.ok(admin.includes("state(ok?'채널 연결 확인됨':'채널 연결 확인 필요')"));
});

test('connection refresh is read-only and cannot start a new Google OAuth consent',()=>{
  const start=admin.indexOf("const refreshConnection=$('mallSocialVerifyConnection')");
  assert.ok(start>=0);
  const end=admin.indexOf("\n",start);
  const handler=admin.slice(start,end);
  assert.ok(handler.includes('await channel()'));
  assert.ok(!handler.includes('startChannelConnect'));
  assert.ok(!handler.includes('accountEl.requestSubmit'));
});
