import test from 'node:test';
import assert from 'node:assert/strict';
import {isSiteDirectoryListIntent, buildAdminSiteDirectoryReply, SITE_DIRECTORY_CORE_POLICY} from '../admin-site-directory-core.js';

test('Korean platform site-list requests use read-only Core intent', () => {
  for (const prompt of ['에코디 플랫폼 사이트 목록', '에코디 전체 서비스 현황', '전체 사이트 목록 보여줘', 'EKODI 사이트 리스트 알려줘']) {
    assert.equal(isSiteDirectoryListIntent(prompt), true, prompt);
  }
  for (const prompt of ['', '  ', '에코디 플랫폼 사이트를 삭제해', '에코디 사이트 목록을 수정해', '사이트 추가해', '안녕', '에코디 플랫폼 배포']) {
    assert.equal(isSiteDirectoryListIntent(prompt), false, prompt);
  }
  assert.equal(SITE_DIRECTORY_CORE_POLICY.mutates, false);
});
test('directory response comes only from registered safe canonical paths, with truthful statuses', () => {
  const reply=buildAdminSiteDirectoryReply({
    workspaces:[{id:'a',name:'테스트 사이트',canonicalUrl:'https://ekodi.kr/test'}],
    services:[{id:'b',name:'베타 서비스',url:'https://ekodi.kr/beta',status:'beta'}, {id:'c',name:'외부 주소',url:'https://outside.example/secret',status:'live'}],
  });
  assert.match(reply, /Workspace 사이트 1개/);
  assert.match(reply, /등록 서비스 2개/);
  assert.match(reply, /테스트 사이트 · \/test/);
  assert.match(reply, /베타 서비스 · \/beta · 베타 등록/);
  assert.match(reply, /외부 주소 · \(등록 경로 확인 필요\)/);
  assert.doesNotMatch(reply, /outside\.example/);
  assert.match(reply, /실제 접속 상태.*검증한 결과가 아닙니다/);
  assert.match(reply, /배포를 수행하지 않았습니다/);
});
test('real registries are available without AI providers', () => {
  const text=buildAdminSiteDirectoryReply();
  assert.match(text, /Workspace 사이트 11개/);
  assert.match(text, /등록 서비스 37개/);
  assert.match(text, /에코디교회/);
  assert.match(text, /에코디선교회/);
});

test('Control form avoids a change Action and health receipt on directory reads', async () => {
  const fs = await import('node:fs/promises');
  const vm = await import('node:vm');
  const client = await fs.readFile(new URL('../control.js', import.meta.url), 'utf8');
  const server = await fs.readFile(new URL('../ai-agent-control.js', import.meta.url), 'utf8');
  const start = client.indexOf('function isReadOnlySiteDirectoryRequest(');
  const end = client.indexOf('async function submitCommand(', start);
  assert.ok(start > -1 && end > start, 'client classifier must be in the submission path');
  const fn = vm.runInNewContext('(' + client.slice(start, end).trim() + ')');
  assert.equal(fn('에코디 플랫폼 사이트 목록'), true);
  assert.equal(fn('에코디 전체 사이트 목록 삭제해'), false);
  assert.match(client, /if\(executeNow&&!readOnlyDirectory\)/);
  assert.match(client, /status:viewStatus/);
  assert.match(server, /!isSiteDirectoryListIntent\(message\)&&familyAutoDispatchEnabled/);
  assert.ok(server.indexOf('if (isSiteDirectoryListIntent(message))') < server.indexOf("const gateway = buildCoreAiGateway(env, [])"));
  assert.match(server, /provider_misread_input/);
});
