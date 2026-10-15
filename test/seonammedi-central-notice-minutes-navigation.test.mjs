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
test('the top-level Notice link always navigates directly to the standalone notices board',()=>{
 const nav=html.match(/<nav class="ekodi-six-nav" aria-label="주요 메뉴">([\\s\\S]*?)<\\/nav>/)?.[1]||'';
 assert.match(nav,/<a href="board\\/notices"\\s*>공지<\\/a>/);
 assert.doesNotMatch(nav,/data-category-menu="공지"/);
 assert.match(html,/central-category-runtime\\.js\\?v=20261015-notice-direct-all-1/);
 assert.doesNotMatch(html,/id="central-category-preview"/,'retired central notice preview must not reappear');
 assert.doesNotMatch(runtime,/"공지"\\s*:/,'runtime must not hijack direct notice navigation');
 assert.doesNotMatch(runtime,/noticePreview|renderNoticePreview|minutes\\/|board\\/finance/,'no obsolete notice submenu or preview');
 assert.match(runtime,/\\.filter\\(t=>categories\\[t\\.textContent\\.trim\\(\\)\\]\\)/);
 assert.match(css,/\\.central-category-buttons/);
});
test('Minutes keep common navigation and only request a viewer name with a shared token',()=>{
 for(const fragment of ['../shared-site-header.css','class="site-header minutes-site-header"','id="minutesLinkHelp"','href="../board/notices"','href="../#committee-activity"','href="../#timeline"','href="../#channels"','href="../board/voices"','href="../#organization"'])assert.ok(minutesHtml.includes(fragment),fragment);
 assert.match(minutesJs,/if\(!token\)\{form\.hidden=true;document\.getElementById\('minutesLinkHelp'\)\.hidden=false/);
 assert.match(minutesJs,/fetch\('\/api\/seonammedi\/minutes\/'\+encodeURIComponent\(token\)\+'\/viewers'/);
 assert.doesNotMatch(minutesJs,/location\.search.*name/);
});
