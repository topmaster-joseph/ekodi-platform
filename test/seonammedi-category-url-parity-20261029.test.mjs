import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const app=await readFile(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8');
const begin=app.indexOf('function categoryFromMenuHash(');
const end=app.indexOf('function showView(',begin);
assert.ok(begin>=0&&end>begin,'category and URL helpers must stay adjacent');
const helpers=app.slice(begin,end);

function harness(hash=''){
  const location={hash},entries=[];
  const history={pushState(state,title,url){entries.push({state,url});location.hash=url}};
  const allowed={timeline:['전체','신문','정부·공공기관'],committee:['전체','회의·의결','성명·입장 발표']};
  const ctx={location,history,TIMELINE_FILTERS:allowed.timeline,COMMITTEE_FILTERS:allowed.committee,
    viewAliases:{timeline:'status','committee-activity':'committee'},encodeURIComponent,decodeURIComponent};
  runInNewContext(helpers+';globalThis.api={set:setCategoryRoute,read:categoryFromMenuHash};',ctx);
  return {location,entries,api:ctx.api,allowed};
}

for(const [prefix,category,kind] of [
  ['timeline','정부·공공기관','timeline'],
  ['committee-activity','성명·입장 발표','committee'],
]){
  test(prefix+' filter selection persists across URL reload and back/forward',()=>{
    const h=harness('#'+prefix),values=h.allowed[kind];
    h.api.set(prefix,category);
    assert.equal(h.location.hash,'#'+prefix+'/'+encodeURIComponent(category));
    assert.equal(h.api.read(prefix,values),category,'reload restores selected category');
    assert.equal(h.entries[0].state.view,kind==='timeline'?'status':'committee');
    h.api.set(prefix,category);
    assert.equal(h.entries.length,1,'repeat selection does not add duplicate history');
    h.location.hash='#'+prefix;
    assert.equal(h.api.read(prefix,values),'전체','back restores prior category');
    h.location.hash=h.entries[0].url;
    assert.equal(h.api.read(prefix,values),category,'forward restores selected category');
    h.api.set(prefix,'전체');
    assert.equal(h.location.hash,'#'+prefix,'default category has canonical URL');
  });
}

test('invalid, unknown and malformed filter route cannot select unintended category',()=>{
  const h=harness('#timeline/%E0%A4%A');
  assert.equal(h.api.read('timeline',h.allowed.timeline),'전체');
  h.api.set('timeline','관리자');
  h.api.set('other','전체');
  assert.equal(h.entries.length,0);
  h.location.hash='#timeline/'+encodeURIComponent('알 수 없음');
  assert.equal(h.api.read('timeline',h.allowed.timeline),'전체');
});

test('real filter handlers record canonical history while existing router restores it',()=>{
  for(const snippet of [
    "activeTimelineCategory=category;setCategoryRoute('timeline',category);renderTimelineFilters();renderPublicTimeline()",
    "selectedCommitteeFilter=category;setCategoryRoute('committee-activity',category);renderCommitteeActivity()",
    "activeTimelineCategory=categoryFromMenuHash('timeline',TIMELINE_FILTERS)",
    "selectedCommitteeFilter=categoryFromMenuHash('committee-activity',COMMITTEE_FILTERS)",
    "window.addEventListener('popstate',syncViewFromLocation)",
    "window.addEventListener('hashchange',syncViewFromLocation)",
  ]) assert.ok(app.includes(snippet),snippet);
  assert.match(html,/app\.js\?v=20261029-filter-url-parity-1/);
});
