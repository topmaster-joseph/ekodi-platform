import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [html,runtime,css,minutesHtml,minutesJs]=await Promise.all([
load('sites/seonammedi/public/index.html'),
load('sites/seonammedi/public/central-category-runtime.js'),
load('sites/seonammedi/public/central-category-menu.css'),
load('sites/seonammedi/public/minutes/index.html'),
load('sites/seonammedi/public/minutes/minutes.js'),
]);
test('Notice menu shows a text-only live list from the published independent notice board',()=>{
 assert.match(html,/id="central-category-preview"/);
 assert.match(runtime,/async function renderNoticePreview\(\)/);
 assert.match(runtime,/fetch\('\/board\/api\/notices',\{cache:'no-store'\}\)/);
 assert.doesNotMatch(runtime,/fetch\('\/api\/seonammedi\/notices'/);
 assert.match(runtime,/item\.status==='published'/);
 assert.match(runtime,/row\.href='board\/notices\?id='\+encodeURIComponent/);
 assert.match(runtime,/row\.append\(name,date\)/);
 assert.doesNotMatch(runtime,/createElement\('img'\)/);
 assert.match(runtime,/noticePreview\.hidden=name!=='공지'/);
 assert.match(css,/\.central-category-preview-row/);
});
test('Minutes keep common navigation and only request a viewer name with a shared token',()=>{
 for(const fragment of ['../shared-site-header.css','class="site-header minutes-site-header"','id="minutesLinkHelp"','href="../board/notices"','href="../#committee-activity"','href="../#timeline"','href="../#channels"','href="../board/voices"','href="../#organization"'])assert.ok(minutesHtml.includes(fragment),fragment);
 assert.match(minutesJs,/if\(!token\)\{form\.hidden=true;document\.getElementById\('minutesLinkHelp'\)\.hidden=false/);
 assert.match(minutesJs,/fetch\('\/api\/seonammedi\/minutes\/'\+encodeURIComponent\(token\)\+'\/viewers'/);
 assert.doesNotMatch(minutesJs,/location\.search.*name/);
});
