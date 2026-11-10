import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('EKODI Insurance local protected-care CI retains exact account/privacy/claims site structure',async()=>{
 const [html,css]=await Promise.all([read('sites/ekodi-insurance/public/index.html'),read('sites/ekodi-insurance/public/styles.css')]);
 assert.match(html,/data-insurance-ci="safe-shield" aria-hidden="true"/);
 assert.match(html,/<svg width="23" height="23" viewBox="0 0 64 64"/);
 assert.match(html,/EKODI Insurance<\/strong><small>AI Insurance Care<\/small>/);
 for(const view of ['diagnosis','my-insurance','claims','compare','advisor','privacy'])assert.ok(html.includes('data-view="'+view+'"'));
 assert.match(html,/실제 설계사 상담을 요청할 때만/);
 assert.match(html,/AI 대화 원문 공유는 별도로 선택할 수 있습니다/);
 assert.match(css,/\.brand-mark\[data-insurance-ci="safe-shield"\] svg/);
 assert.match(css,/@media\(max-width:820px\)/);
 assert.doesNotMatch(html,/상표등록 완료|EKODI®/);
});
