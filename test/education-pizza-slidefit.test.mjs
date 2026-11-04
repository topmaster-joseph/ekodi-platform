import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const css=readFileSync(resolve(root,'education/pizza-experience/one-screen.css'),'utf8');
const html=readFileSync(resolve(root,'education/pizza-experience/index.html'),'utf8');
const js=readFileSync(resolve(root,'education/pizza-experience/app.js'),'utf8');
const newStyles=css.slice(css.indexOf('/* Dense slide fitting:'));
test('dense pizza slides stay scoped to EKODI Education workshop',()=>{
 assert.ok(newStyles.startsWith('/* Dense slide fitting:'));
 assert.ok(newStyles.split('\n').filter(line=>line.trim()&&!line.trim().startsWith('/*')&&!line.trim().startsWith('*/')).every(line=>
   !line.startsWith('body')&&!line.startsWith('html')&&!line.includes('@import')
 ),'do not mutate global Education, auth, or admin styles');
 assert.match(html,/one-screen\.css/);
 assert.match(js,/data-quiz-group/);
 assert.match(js,/builder:true/);
});
test('quizzes display all choices and feedback without an inner scrollbar',()=>{
 assert.match(newStyles,/#pizza-exp \.scene-detail\{overflow:hidden/);
 assert.match(newStyles,/#pizza-exp \.scene \.slide-quiz\{display:grid/);
 assert.match(newStyles,/\.answer-feedback:empty\{display:none\}/);
 assert.match(newStyles,/\.slide-quiz \.answer-buttons\{display:flex;flex-wrap:nowrap/);
});
test('four ingredients and pizza builder use compact, usable controls',()=>{
 assert.match(newStyles,/\.scene-visuals\{display:flex;flex-wrap:nowrap/);
 assert.match(newStyles,/\.scene \.pizza-builder\{display:grid/);
 assert.match(newStyles,/\.scene \.make-pizza\{grid-column:1;grid-row:1\/4/);
 assert.match(newStyles,/\.scene \.topping-buttons button\{min-width:0/);
 assert.match(newStyles,/@media\(max-width:700px\)/);
 assert.match(newStyles,/grid-template-rows:minmax\(75px,\.29fr\) minmax\(0,1\.71fr\)/);
 assert.match(newStyles,/grid-template-rows:minmax\(95px,\.43fr\) minmax\(0,1\.57fr\)/);
});
