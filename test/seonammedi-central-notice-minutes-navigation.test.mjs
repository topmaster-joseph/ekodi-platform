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
 const navStart=html.indexOf('<nav class="ekodi-six-nav" aria-label="주요 메뉴">');
 const navEnd=html.indexOf('</nav>',navStart);
 assert.ok(navStart>=0&&navEnd>navStart,'six-menu navigation missing');
 const nav=html.slice(navStart,navEnd);
 assert.ok(nav.includes('<a href="board/notices" >공지</a>'),'the Notice label links to the public notice board');
 assert.ok(!nav.includes('data-category-menu="공지"'),'Notice must not be a category menu');
 assert.ok(html.includes('central-category-runtime.js?v=20261015-notice-direct-all-1'),'browser must load new menu runtime');
 assert.ok(!html.includes('id="central-category-preview"'),'obsolete central notice preview must not render');
 for(const legacy of ['"공지":','noticePreview','renderNoticePreview','minutes/','board/finance'])assert.ok(!runtime.includes(legacy),'obsolete Notice handler remains: '+legacy);
 assert.ok(runtime.includes('filter(t=>categories[t.textContent.trim()])'),'menu intercept must apply only to genuine category tabs');
 assert.ok(css.includes('.central-category-buttons'),'other category tabs must still work');
});
test('Minutes keep common navigation and only request a viewer name with a shared token',()=>{
 for(const fragment of ['../shared-site-header.css','class="site-header minutes-site-header"','id="minutesLinkHelp"','href="../board/notices"','href="../#committee-activity"','href="../#timeline"','href="../#channels"','href="../board/voices"','href="../#organization"'])assert.ok(minutesHtml.includes(fragment),fragment);
 assert.match(minutesJs,/if\(!token\)\{form\.hidden=true;document\.getElementById\('minutesLinkHelp'\)\.hidden=false/);
 assert.match(minutesJs,/fetch\('\/api\/seonammedi\/minutes\/'\+encodeURIComponent\(token\)\+'\/viewers'/);
 assert.doesNotMatch(minutesJs,/location\.search.*name/);
});
