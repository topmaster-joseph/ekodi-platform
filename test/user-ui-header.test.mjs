import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('user UI header is a shared user-surface-only module',async()=>{
  const [header,worker,principles]=await Promise.all([
    read('shell/user-ui-header.js'),
    read('ekodi-shell-worker.js'),
    read('docs/user-ui-module-principles.md')
  ]);

  assert.match(header,/USER_SURFACES=new Set\(\['public','workspace'\]\)/);
  assert.match(header,/DISABLED_MODES=new Set\(\['off','hidden','immersive'\]\)/);
  assert.match(header,/position:fixed!important/);
  assert.match(header,/left:50%!important/);
  assert.match(header,/text-align:center!important/);
  assert.match(header,/data-ekodi-user-header-spacer/);
  assert.match(header,/--ekodi-user-header-height/);
  assert.match(header,/window\.EKODIUserUIHeader/);
  assert.match(header,/ekodi:shell-theme/);
  assert.match(header,/data-ekodi-header-title/);
  assert.doesNotMatch(header,/body\s*\{[^}]*text-align\s*:\s*center/is);

  assert.match(worker,/userHeaderUrl\.pathname='\/user-ui-header\.js'/);
  assert.match(worker,/x-ekodi-user-ui-header/);
  assert.doesNotMatch(worker,/headerUrl\.pathname='\/mobile-fixed-header\.js'/);

  assert.match(principles,/중앙 정렬 원칙은 \*\*헤더 영역에만\*\* 적용한다/);
  assert.match(principles,/관리자 화면\(`admin`\)/);
  assert.match(principles,/각 사이트의 브랜드, 목적, 사용자 흐름/);
});
