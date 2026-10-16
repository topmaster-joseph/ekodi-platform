import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [app,css,html]=await Promise.all([
  read('sites/seonammedi/public/app.js'),
  read('sites/seonammedi/public/app.css'),
  read('sites/seonammedi/public/index.html')
]);

const start=app.indexOf('function bindCompactTimelineToggles(host){');
const end=app.indexOf('function bindCommitteeActivityAdmin(){',start);
assert.ok(start>=0&&end>start,'public timeline display functions must be intact');
const publicRenderers=app.slice(start,end);
const titleClass='class="timeline-title-toggle" aria-expanded="false"';

test('activity, news and committee-related news render only title visible at first visit',()=>{
  const hosts=Object.fromEntries(['timelineList','committeeActivityList','committeeNewsList'].map(id=>
    [id,{innerHTML:'',querySelectorAll:()=>[],dataset:{}}]));
  const rows=[
    {id:1,title:'비대위 기자회견',date:'2026.10.17',recordScope:'committee',summary:'비대위 활동 본문',committeeKind:'기자회견',evidence:'직접 확인',links:[]},
    {id:2,title:'비대위 관련소식',date:'2026.10.16',recordScope:'news',committeeRelated:true,summary:'보도 본문',category:'신문',evidence:'매체',links:[]},
    {id:3,title:'독립 관련소식',date:'2026.10.15',recordScope:'news',summary:'관련소식 본문',category:'방송',evidence:'방송국',links:[]}
  ];
  const sandbox={
    el:id=>hosts[id]||null,
    publicTimelineEntries:rows,
    isCommitteeRecord:x=>x.recordScope==='committee',
    isCommitteeRelatedNews:x=>x.committeeRelated===true,
    relatedNewsFilterMatches:()=>true,
    activeTimelineCategory:'전체',
    publicTimelineAdminMode:false,
    publicContentInlineMode:false,
    relatedNewsCategory:x=>x.category||'신문',
    timelineDescending:(a,b)=>b.date.localeCompare(a.date),
    committeeItems:()=>[rows[0]],
    escapeHtml:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    evidenceBlock:()=>'<a href="#">원문</a>',
    attachMonitorMedia:()=>{},
    window:{__SEONAM_MONITOR_ITEMS:[]}
  };
  const api=vm.runInNewContext(publicRenderers+'\n({renderPublicTimeline,renderCommitteeNews,renderCommitteeActivity})',sandbox);
  api.renderPublicTimeline();
  api.renderCommitteeNews();
  api.renderCommitteeActivity();
  for(const id of Object.keys(hosts)){
    const markup=hosts[id].innerHTML;
    assert.match(markup,/class="timeline-item timeline-compact is-collapsed"/,id+' initially collapsed');
    assert.match(markup,/<h3><button type="button" class="timeline-title-toggle" aria-expanded="false">/,id+' clickable heading');
    assert.match(markup,/class="timeline-summary"/,id+' preserves body to expand');
    assert.match(markup,/class="timeline-detail"/,id+' preserves source links');
    assert.doesNotMatch(markup,/class="timeline-item timeline-compact"/,id+' none open initially');
  }
  assert.match(hosts.committeeActivityList.innerHTML,/비대위 기자회견/);
  assert.match(hosts.committeeNewsList.innerHTML,/비대위 관련소식/);
  assert.match(hosts.timelineList.innerHTML,/독립 관련소식/);
});

test('title click expands and collapses without losing source or admin controls',()=>{
  let collapsed=true;
  const attrs=new Map();
  const title={setAttribute:(k,v)=>attrs.set('title-'+k,v),listeners:{},
    addEventListener(name,fn){this.listeners[name]=fn},closest:()=>card};
  const close={setAttribute:(k,v)=>attrs.set('bottom-'+k,v),textContent:'접기',listeners:{},
    addEventListener(name,fn){this.listeners[name]=fn},closest:()=>card};
  const card={
    classList:{toggle(name){assert.equal(name,'is-collapsed');collapsed=!collapsed;return collapsed}},
    querySelector:selector=>selector==='.timeline-title-toggle'?title:close
  };
  const sandbox={};
  vm.runInNewContext(publicRenderers+'\nthis.bindCompactTimelineToggles=bindCompactTimelineToggles;',sandbox);
  sandbox.bindCompactTimelineToggles({querySelectorAll:()=>[title,close]});
  title.listeners.click();
  assert.equal(collapsed,false);
  assert.equal(attrs.get('title-aria-expanded'),'true');
  assert.equal(attrs.get('bottom-aria-expanded'),'true');
  assert.equal(close.textContent,'접기');
  close.listeners.click();
  assert.equal(collapsed,true);
  assert.equal(attrs.get('title-aria-expanded'),'false');
  assert.equal(close.textContent,'자세히 보기');
});

test('CSS conceals date, summary, chips, source and admin until explicitly expanded',()=>{
  assert.match(css,/\.timeline-item\.timeline-compact\.is-collapsed\s*\{/);
  for(const className of ['timeline-date','timeline-summary','chips','timeline-detail','timeline-admin-actions','timeline-toggle'])
    assert.ok(css.includes('.timeline-item.timeline-compact.is-collapsed .'+className),
      'must hide '+className+' from default list');
  assert.match(css,/\.timeline-item\.timeline-compact\.is-collapsed \.timeline-toggle\{display:none!important\}/);
  assert.match(css,/\.timeline-title-toggle:focus-visible/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(html,/\/seonammedi\/app\.css\?v=20261017-title-only-1/);
  assert.match(html,/\/seonammedi\/app\.js\?v=20261017-title-only-1/);
  assert.match(html,/id="timelineList"/);
  assert.match(html,/id="committeeActivityList"/);
  assert.match(html,/id="committeeNewsList"/);
});
