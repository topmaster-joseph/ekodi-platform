import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { messengerUserPage, messengerUiScript } from '../messenger-user-page.js';
import { handleMessengerOperatorPage } from '../messenger-operator-page.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Messenger user page removes developer-first UI and keeps legacy API DOM contract',async()=>{
  const response=messengerUserPage();
  const html=await response.text();
  assert.equal(response.status,200);
  for(const marker of ['궁금한 것을 편하게 말씀해 주세요.','무엇을 도와드릴까요?','대화 검색','담당자 연결','Google로 계속하기']) assert.match(html,new RegExp(marker));
  for(const id of ['workspace','threadList','newThreadBtn','newThreadDialog','newThreadForm','threadTitleInput','threadMessageInput','targetServiceInput','messageForm','messageInput','handoffBtn','status']) assert.match(html,new RegExp(`id="${id}"`));
  assert.doesNotMatch(html,/>FUNCTIONAL BETA</);
  assert.doesNotMatch(html,/연결 서비스<input|제목<input/);
  assert.match(html,/type="hidden" value="ekodi"/);
});

test('Messenger helper auto-generates title and supports mobile thread navigation',async()=>{
  const response=messengerUiScript();
  const js=await response.text();
  assert.match(js,/makeTitle/);
  assert.match(js,/conversationSearch/);
  assert.match(js,/thread-open/);
  assert.match(js,/requestSubmit/);
});

test('shared router entry changes only Messenger and delegates all other services',async()=>{
  const entry=await read('platform-router-entry-worker.js');
  assert.match(entry,/MESSENGER_HOST='messenger\.ekodi\.kr'/);
  assert.match(entry,/messengerUserPage/);
  assert.match(entry,/legacyPlatformRouter\.fetch/);
  assert.match(entry,/x-ekodi-staging-host/);
});

test('Operator page is a conversation cockpit rather than a raw JSON console',async()=>{
  const response=handleMessengerOperatorPage(new Request('https://api.ekodi.kr/operator'));
  const html=await response.text();
  assert.equal(response.status,200);
  for(const marker of ['관리자 대화 조종석','중요 대화','직접 응답','AI에게 반환','대화 정보','상세 관리자']) assert.match(html,new RegExp(marker));
  assert.doesNotMatch(html,/<pre/);
  assert.doesNotMatch(html,/JSON 결과|raw json/i);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.match(response.headers.get('content-security-policy'),/accounts\.google\.com/);
});

test('Operator script uses existing authenticated Messenger control endpoints',async()=>{
  const response=handleMessengerOperatorPage(new Request('https://api.ekodi.kr/operator.js'));
  const js=await response.text();
  for(const marker of ['/api/control/messenger/inbox','/api/control/messenger/threads/','takeover','release','reply','close','/api/google/challenge','/api/google/login']) assert.ok(js.includes(marker));
  assert.match(js,/authorization:'Bearer '/);
  assert.match(js,/setInterval/);
});

test('production configs point to friendly Messenger entry and allow same-origin Operator',async()=>{
  const [prod,staging,api,mission]=await Promise.all([
    read('wrangler.site.toml'),read('wrangler.site-staging.toml'),read('wrangler.api.toml'),read('mission-control-entry-worker.js')
  ]);
  assert.match(prod,/main = "platform-router-entry-worker\.js"/);
  assert.match(staging,/main = "platform-router-entry-worker\.js"/);
  assert.match(api,/https:\/\/api\.ekodi\.kr/);
  assert.match(mission,/handleMessengerOperatorPage/);
  assert.match(mission,/handleSameOriginOperatorGoogleAuth/);
});
