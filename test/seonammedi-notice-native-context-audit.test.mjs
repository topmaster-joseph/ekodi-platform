import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');

test('native Chromium checks Notice after in-page categories while independently validating citizen public-list navigation and write login',()=>{
  for(const label of ['활동이력','관련소식','소통채널','조직'])assert.ok(source.includes("label:'"+label+"'"),label);
  for(const selector of ['a[data-view-link="committee"]','a[data-view-link="status"]','a[data-view-link="channels"]','a[data-view-link="organization"]'])assert.ok(source.includes(selector),selector);
  assert.ok(source.includes("record.noticeAfterCategory=[]"),'per-context evidence must be recorded');
  assert.ok(source.includes("record.citizenVoiceLinkMatches"),'citizen list navigation must be publicly accessible');
  assert.ok(source.includes("u.search==='' && u.hash===''"),'citizen menu must not force authentication');
  assert.ok(source.includes("record.voiceMenuPublicList"),'guest must be shown the public list after menu click');
  assert.ok(source.includes("root.prefix+'/board/notices'"),'route must use current mount prefix');
  assert.ok(source.includes("page.waitForURL"),'verify actual browser location after link click');
  assert.ok(source.includes('root.origin+root.prefix+suffix'),'both origins must be exercised');
  assert.ok(source.includes("name:'desktop'")&&source.includes("name:'mobile'"),'both viewport profiles required');
});
test('native Notice audit remains read-only and bounded',()=>{
  assert.ok(source.includes("if(!['GET','HEAD','OPTIONS'].includes(method))"),'all mutation HTTP methods denied');
  assert.ok(source.includes("route.abort('blockedbyclient')"),'mutation attempts blocked');
  assert.ok(source.includes("await page.goto(target,{waitUntil:'domcontentloaded',timeout:25000})"),'bounded reload required');
  assert.ok(source.includes("if(attempt===0)await pause(3000)"),'retry stays bounded');
});
