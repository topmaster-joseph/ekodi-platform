import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('ai-control/commons.html');
const css=read('ai-control/commons.css');
const client=read('ai-control/commons.js');
const supportWorker=read('support-worker.js');

test('all AI Commons sections share one persistent accessible header',()=>{
  assert.match(html,/<header class="site-header">/);
  assert.match(html,/<nav class="site-nav" aria-label="모두의 AI 주요 메뉴">/);
  assert.match(html,/href="\/ai\/#support-programs">지원사업<\/a>/);
  assert.match(html,/id="support-programs" aria-labelledby="supportTitle"/);
  assert.match(css,/\.site-header\{position:sticky;top:0;z-index:40/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/\.site-nav\{[^}]*overflow-x:auto/);
  assert.equal((html.match(/id="sessionState"/g)||[]).length,1);
  assert.equal((html.match(/id="loginLink"/g)||[]).length,1);
});
test('support notices reuse the isolated read-only public support API',()=>{
  assert.match(html,/href="\/ai\/support\/">맞춤 지원사업 찾기/);
  assert.match(client,/SUPPORT_FEED_URL='\/support\/api\/opportunities\?source=combined&limit=100'/);
  assert.match(client,/item\.official===true&&AI_NOTICE_PATTERN\.test/);
  assert.match(client,/credentials:'omit',cache:'no-store'/);
  assert.match(client,/result\.ok!==true\|\|!Array\.isArray\(result\.items\)/);
  assert.match(client,/title\.textContent=item\.title/);
  assert.match(client,/url\.protocol==='https:'/);
  assert.match(client,/renderSupportFeed\(\)/);
  assert.match(supportWorker,/pathname==='\/api\/opportunities'&&request\.method==='GET'/);
  assert.doesNotMatch(client,/BIZINFO_API_KEY|SERVICE_ROLE_KEY|fetch\('https:\/\/www\.bizinfo\.go\.kr/);
});
test('the notice pane distinguishes open, expired and uncertain dates',()=>{
  assert.match(client,/function supportNoticeStatus\(item,today=supportKoreaDate\(\)\)/);
  assert.match(client,/today>end.*kind:'closed'/);
  assert.match(client,/kind:'soon'/);
  assert.match(client,/kind:'unknown'/);
  assert.match(client,/확인되지 않은 공고는 임의로 표시하지 않습니다/);
});
