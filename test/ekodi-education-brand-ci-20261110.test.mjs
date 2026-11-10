import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('Education local home CI preserves identity, roles, login, study navigation and responsiveness',async()=>{
 const [html,css]=await Promise.all([read('education/index.html'),read('education/styles.css')]);
 assert.match(html,/data-edu-ci="rising-path" aria-hidden="true"/);
 assert.match(html,/<svg width="23" height="23" viewBox="0 0 64 64"/);
 assert.match(html,/EKODI Education<\/strong><small>모두의 평생학습<\/small>/);
 for(const id of ['#heroTitle','#discover','#learningPath','#educationCourses','#learningCommunity','#resources','#myLearningTitle'])assert.ok(html.includes('href="'+id+'"'));
 assert.match(html,/id="authButton"/);
 assert.match(css,/\.mark\[data-edu-ci="rising-path"\] svg/);
 assert.match(css,/@media\(max-width:820px\)/);
 assert.doesNotMatch(html,/EKODI®|상표등록 완료/);
});
