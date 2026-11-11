import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sites=[["author","creator-page","id=\"authButton\""],["energy","energy-sun","headerSolarNow"],["management","management-columns","site=management"],["work","work-bag","id=\"loginBtn\""],["bible","bible-open-book","id=\"authButton\""],["life","life-conversation","id=\"platformName\""],["money","money-organize","금융생활"],["local-commerce","local-market","현금 보관 없음"],["support","support-open-path","공식 출처를 우선하며"]];
test('EKODI specialist homepage CI remains local, distinctive and does not change controls',()=>{
 const seen=new Set();
 for(const [dir,id,core] of sites){
  const html=read(dir+'/index.html');const css=read(dir+'/styles.css');
  assert.ok(html.includes('data-site-ci="'+id+'"'),dir);
  assert.ok(html.includes('<svg'),dir);
  assert.ok(html.includes('aria-hidden="true"'),dir);
  assert.ok(css.includes(id),dir+' CSS');
  assert.ok(html.includes(core),dir+' original core');
  assert.ok(!html.includes('EKODI®')&&!html.includes('상표등록 완료'),dir);
  seen.add(id);
 }
 assert.equal(seen.size,9);
});
test('specialist homepage core assertions and legal notices stay intact',()=>{
 assert.match(read('bible/index.html'),/에코디 말씀대화/);
 assert.match(read('energy/index.html'),/현재 샘플 태양광 발전량/);
 assert.match(read('life/index.html'),/오늘의 질문/);
 assert.match(read('money/index.html'),/실제 이체/);
 assert.match(read('local-commerce/index.html'),/자동 송금 없음/);
 assert.match(read('support/index.html'),/최종 확인 없이 실행하지 않습니다/);
 assert.match(read('management/index.html'),/무료로 시작하기/);
 assert.match(read('work/index.html'),/data-view="employer"/);
});
