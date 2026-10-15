import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [header,central,centralCss,app,appCss,html]=await Promise.all([
  load('sites/seonammedi/public/shared-site-header.css'),
  load('sites/seonammedi/public/central-category-runtime.js'),
  load('sites/seonammedi/public/central-category-menu.css'),
  load('sites/seonammedi/public/app.js'),
  load('sites/seonammedi/public/app.css'),
  load('sites/seonammedi/public/index.html')
]);
test('six menu links and brand use central content width on PC, mobile stays scrollable',()=>{
  assert.match(header,/--seonam-central-content-width:1080px/);
  assert.match(header,/padding:12px max\(16px,calc\(\(100vw - var\(--seonam-central-content-width\)\)\/2\)\)!important/);
  assert.match(header,/@media\(max-width:780px\)/);
  assert.match(header,/\.site-header>\.ekodi-six-nav\{margin-left:auto/);
  assert.match(html,/class="ekodi-six-nav" aria-label="주요 메뉴"/);
});
test('activity and news category ribbon reflects one live filter source',()=>{
  assert.match(central,/function categoryItems\(name\)/);
  assert.match(central,/committeeActivityFilters/);
  assert.match(central,/timelineFilters/);
  assert.match(central,/categoryItems\(name\)\.forEach/);
  assert.match(header,/body\[data-seonammedi-central-topic="committee"\] #committeeActivityFilters/);
  assert.match(header,/body\[data-seonammedi-central-topic="news"\] #timelineFilters/);
  assert.match(app,/categoryPanel\.scrollIntoView/);
  assert.match(centralCss,/central-category-buttons a/);
});
test('social channel remains usable as text-only links during backend outage',()=>{
  assert.match(app,/fallbackLinks=\[/);
  assert.match(app,/www\.instagram\.com\/wonokoh/);
  assert.match(app,/www\.youtube\.com\/@Mokpo-tv/);
  assert.match(app,/www\.facebook\.com\/groups\/2299276407568855\/posts/);
  assert.match(app,/host\.replaceChildren\(\)/);
  assert.match(header,/data-seonammedi-central-topic="channels"\] #channels/);
  assert.match(central,/embed\.hidden=true;fallback\.textContent='페이스북 게시물은/);
  assert.doesNotMatch(central,/createElement\('iframe'\)/);
  assert.match(appCss,/channel-text-fallback-link/);
});
