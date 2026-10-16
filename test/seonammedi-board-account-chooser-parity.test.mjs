import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const board=readFileSync(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
const auth=readFileSync(new URL('../auth-site/auth.js',import.meta.url),'utf8');
test('citizen voice Google sign-in explicitly requests account selection and retains compose return',()=>{
  assert.match(board,/auth\.searchParams\.set\("choose_account","1"\)/);
  assert.match(board,/auth\.searchParams\.set\("return_to",target\.href\)/);
  assert.match(board,/target\.searchParams\.set\("compose","1"\)/);
  assert.match(auth,/chooseAccount=site==='seonammedi'&&params\.get\('choose_account'\)==='1'/);
  assert.match(auth,/if\(chooseAccount\)\{window\.google\?\.accounts\?\.id\?\.disableAutoSelect\?\.\(\);if\(initial\)await sb\.auth\.signOut\(\{scope:'local'\}\);await prepareGoogle\(\);\}/);
  assert.match(auth,/auto_select:false/);
});
test('board footer uses same content/management structure as public site',()=>{
  assert.match(board,/const footer=.*footer-inner site-footer-copy/);
  assert.match(board,/id="adminLink"/);
  assert.match(board,/자료의 성격과 출처를 구분해 보존합니다/);
  assert.match(board,/function nav\(active,req\)/);
  for(const label of ['공지','활동이력','관련소식','소통채널','시민의견','조직'])assert.ok(board.includes(label));
});
