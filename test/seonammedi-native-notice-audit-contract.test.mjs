import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('native guest audit requires a direct Notice link and rejects stale category interception',async()=>{
  const [audit,home,runtime,board]=await Promise.all([
    read('scripts/verify-seonammedi-nav-guest-native.mjs'),
    read('sites/seonammedi/public/index.html'),
    read('sites/seonammedi/public/central-category-runtime.js'),
    read('sites/seonammedi/public/board-central-category.js')
  ]);
  assert.ok(audit.includes("const expectedNoticePath=root.prefix+'/board/notices'"));
  assert.ok(audit.includes("new URL(noticeLink.href,target).pathname"));
  assert.ok(audit.includes("notice_direct_path_mismatch"));
  assert.ok(audit.includes("notice_category_click_interception"));
  assert.ok(!audit.includes('notice_submenu_missing'));
  assert.ok(!audit.includes("noticeEntries.some"));
  assert.ok(home.includes('href="board/notices" >공지</a>'));
  assert.ok(!runtime.includes('"공지":'));
  assert.ok(!board.includes("'공지':['"));
  assert.ok(board.includes("{key:'notices',label:'공지',href:base+'board/notices'}"));
});

test('native browser still checks Notice after all other menus on both origins and mobile/desktop',async()=>{
  const audit=await read('scripts/verify-seonammedi-nav-guest-native.mjs');
  for(const label of ['활동이력','관련소식','소통채널','시민의견','조직'])
    assert.ok(audit.includes("label:'"+label+"'"),'missing source menu '+label);
  for(const origin of ['https://seonammedi.kr','https://ekodi.kr'])
    assert.ok(audit.includes(origin),'missing canonical origin '+origin);
  assert.ok(audit.includes("name:'desktop'")&&audit.includes("name:'mobile'"));
  assert.ok(audit.includes('record.noticeAfterCategory'));
  assert.ok(audit.includes("await page.waitForURL"));
  assert.ok(audit.includes("readOnly:true"));
  assert.ok(audit.includes("guest_write_did_not_open_canonical_login"));
});
