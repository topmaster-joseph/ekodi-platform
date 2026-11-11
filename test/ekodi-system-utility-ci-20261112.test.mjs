import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sites=[
['ai-control','control-coordinator','id="authLink"','styles.css'],
['auth-site','identity-open-loop','id="googleButtonHost"','auth.css'],
['notifications','notice-bell','id="consent"','style.css'],
['proposal','proposal-sheet','서버 저장 없음','app.css'],
['seasonal-workforce','seasonal-agri','제안용 시범 화면',null],
['experience','experience-portal','id="start-experience"','styles.css']
];
test('6 system/utility homepages keep their own small CI without changing core contract',()=>{
 for(const [dir,mark,guard,cssName] of sites){
  const h=read(dir+'/index.html');
  assert.ok(h.includes('data-site-ci="'+mark+'"'),dir);
  assert.match(h,/<svg /);
  assert.ok(h.includes(guard),dir+' control/pilot claim');
  const css=cssName?read(dir+'/'+cssName):h;
  assert.ok(css.includes(mark),dir+' local CSS');
  assert.doesNotMatch(h,/EKODI®|상표등록 완료/);
 }
});
test('auth and notification consent remains authentic',()=>{
 const auth=read('auth-site/index.html');
 assert.match(auth,/return_to/);
 assert.match(auth,/data-seamless-sso/);
 const note=read('notifications/index.html');
 assert.match(note,/구독 해지/);
 assert.match(note,/광고성 알림 미포함/);
 assert.match(read('ai-control/index.html'),/noindex,nofollow/);
});
