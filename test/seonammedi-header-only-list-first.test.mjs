import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [shell,css,app,home]=await Promise.all([
  read('sites/seonammedi/public/board-central-category.js'),
  read('sites/seonammedi/public/shared-site-header.css'),
  read('sites/seonammedi/public/app.js'),
  read('sites/seonammedi/public/index.html')
]);
const count=(source,needle)=>source.split(needle).length-1;

test('home and independent board share a content/calendar shell without duplicate left navigation',()=>{
  assert.ok(home.includes('/seonammedi/board/ui/central-category.js'));
  assert.match(shell,/main\.append\(content,right\)/);
  for(const oldMenu of ['seonam-visual-left','seonam-visual-side-nav','seonam-visual-side-card']){
    assert.ok(!shell.includes(oldMenu),oldMenu+' must not be mounted');
    assert.ok(!css.includes(oldMenu),oldMenu+' must not reserve layout space');
  }
  assert.ok(css.includes('grid-template-columns:minmax(0,1fr) minmax(210px,260px)'));
  assert.ok(css.includes('@media(max-width:760px)'));
  assert.ok(shell.includes('SeonamMediCalendar?.mount({newsBox,quick})'));
  assert.match(home,/<nav class="ekodi-six-nav"/);
});

test('activity and related news load as date/title rows until the heading is selected',()=>{
  assert.equal(count(app,'class="timeline-toggle timeline-title-button" aria-expanded="false"'),3);
  assert.equal(count(app,"'<article class=\"timeline-item'+' is-collapsed'"),3);
  assert.ok(!app.includes("(index>2?'false':'true')"));
  assert.ok(!app.includes("(index>2?' is-collapsed':'')"));
  for(const list of ['committeeActivityList','committeeNewsList','timelineList']){
    assert.ok(css.includes('#'+list+' .timeline-item.is-collapsed'),list);
  }
  assert.ok(css.includes('.timeline-admin-actions){display:none!important}'));
  assert.ok(app.includes("button.setAttribute('aria-expanded',collapsed?'false':'true')"));
  assert.ok(app.includes("button.setAttribute('aria-expanded',closed?'false':'true')"));
});
