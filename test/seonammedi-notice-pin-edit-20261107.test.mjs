import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = f => readFile(new URL('../' + f, import.meta.url), 'utf8');
const [html, app, control] = await Promise.all([
  read('sites/seonammedi/public/index.html'),
  read('sites/seonammedi/public/app.js'),
  read('seonammedi-admin-control.js'),
]);

test('events notice edit offers 중요공지 only to accounts that may pin', () => {
  assert.match(html, /<label id="noticePinRow" class="notice-pin-option" hidden><input id="noticePinned" name="pinned" type="checkbox" value="1"> 중요공지로 고정/);
  assert.match(app, /pinRow\.hidden=!item\.canPin/);
  assert.match(app, /box\.checked=Boolean\(item\.pinned\)/);
  assert.match(app, /if\(noticeEditingId&&pinRow&&!pinRow\.hidden\)form\.set\('pinned',el\('noticePinned'\)\?\.checked\?'1':'0'\)/);
});

test('server applies pinned only from a platform admin and keeps it otherwise', () => {
  assert.match(control, /canPin:Boolean\(admin\)/);
  assert.match(control, /const pinnedRaw=form\.get\('pinned'\);/);
  assert.match(control, /admin&&pinnedRaw!==null/);
  assert.match(control, /:\(Number\(row\.pinned\)\?1:0\)/);
  assert.match(control, /SET title=\?,body=\?,pinned=\?,image_key=\?/);
  assert.match(control, /SELECT id,title,body,pinned,created_by/);
});
