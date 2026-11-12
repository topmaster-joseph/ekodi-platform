import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('EKODIBIZ mission appears in public hero and translates with all six supported languages',()=>{
 const html=read('ekodibiz/index.html'),js=read('ekodibiz/site.js'),css=read('ekodibiz/style.css');
 assert.match(html,/data-ekodi-mission="biz" aria-label="우리가 존재하는 이유"/);
 assert.match(html,/data-i18n="missionLabel"/);
 assert.match(html,/data-i18n="missionStatement"/);
 assert.match(html,/우리는 필요한 사업의 길을 함께 찾아 사람과 현장과 기술을 정직하게 연결하고, 그 성과가 지역으로 돌아가게 한다\./);
 assert.equal((js.match(/missionLabel:'/g)||[]).length,6);
 assert.equal((js.match(/missionStatement:'/g)||[]).length,6);
 assert.match(js,/missionStatement:'We connect people, real work and technology with integrity/);
 assert.match(css,/\.ekodi-mission-statement/);
 assert.match(html,/href="https:\/\/ekodi\.kr\/ekodibiz\/ai-agency\/apply"/);
 assert.match(js,/customerTelephone/);
});
test('canonical Mall builder template, not stale mall.html, owns visible purpose',()=>{
 const html=read('sites/ekodi-mall/src/index.template.html');
 const build=read('sites/ekodi-mall/scripts/build.mjs');
 const css=read('sites/ekodi-mall/assets/styles.css');
 assert.match(build,/read\('src\/index\.template\.html'\)/);
 assert.match(html,/data-ekodi-mission="mall"/);
 assert.match(html,/우리는 물건을 파는 일을 넘어 생산자의 수고와 구매자의 필요를 정직하게 잇고, 신뢰할 수 있는 거래를 넓힌다\./);
 assert.match(html,/에코디는 상품보다 필요한 이유를 먼저 찾습니다/);
 assert.match(html,/id="contextForm"/);
 assert.match(css,/\.ekodi-mission-statement/);
 assert.match(html,/쿠팡/);
});
