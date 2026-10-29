import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page=readFileSync(new URL('../education/study/farm-marketing/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../education/study/farm-marketing/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../education/study/farm-marketing/styles.css',import.meta.url),'utf8');
const study=readFileSync(new URL('../education/study/index.html',import.meta.url),'utf8');
test('beginner agricultural marketing workshop is reachable from existing Study',()=>{
 assert.match(study,/href="\/study\/farm-marketing\/"/);
 assert.match(page,/data-ekodi-ui="USER"/);
 assert.match(page,/\.\/app\.js/);
 assert.match(page,/\.\/styles\.css/);
 assert.match(page,/id="lesson"/);
 assert.match(page,/id="posterCanvas"/);
 assert.match(page,/id="resultPrompt"/);
});
test('mobile lesson has all 7 stages and 180-minute schedule',()=>{
 assert.match(js,/const STEPS=\[/);
 for(const str of ['0~25분','25~50분','50~85분','85~95분','95~125분','125~155분','155~180분'])assert.ok(js.includes(str),str);
 assert.match(js,/searchParams\.set\('step'/);
 assert.match(css,/@media\(max-width:480px\)/);
});
test('educational browser app has on-device export and no server photo upload',()=>{
 assert.match(js,/toBlob\(/);
 assert.match(js,/createObjectURL\(/);
 assert.match(js,/localStorage\.setItem/);
 assert.doesNotMatch(js,/\bfetch\s*\(/);
 assert.doesNotMatch(page,/script src="https:/);
 assert.match(page,/국립농산물품질관리원/);
});
