import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Mission manager-only planned number is a private projection, never actual attendance',async()=>{
  const [page,client,css,board,presence]=await Promise.all([
    read('space/ekodimission.page'),read('space/ekodimission-participation.js'),
    read('space/ekodimission-participation.css'),read('site-board-control.js'),
    read('space/ekodimission-presence.page')
  ]);
  assert.match(page,/data-mission-private-manager hidden/);
  assert.match(page,/data-mission-planned-count/);
  assert.match(page,/href="\/ekodimission\/presence"/);
  assert.match(page,/예정 인원은 실제 출석이나 활동포인트와 별개/);
  assert.match(client,/data\?\.managerSummary\?\.privatePlannedJoin/);
  assert.match(client,/Number\.isSafeInteger\(count\)&&count>=0/);
  assert.match(client,/manager\.hidden=!canView/);
  assert.match(client,/manager\.hidden=true/);
  assert.match(css,/\.mission-private-manager\[hidden\]\{display:none!important\}/);
  assert.match(board,/if\(who\.manage\)\{/);
  assert.match(board,/verifiedAttendanceNotIncluded:true/);
  assert.match(board,/actualAttendance:'not_verified'/);
  assert.match(presence,/data-ekodi-presence="v1"/);
  assert.doesNotMatch(page,/data-mission-planned-name|data-mission-planned-phone|data-mission-planned-email/);
});
