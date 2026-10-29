import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
const start=source.indexOf('  const mallSourcingIsAmazon=');
const end=source.indexOf('  async function affiliateSourcingPanel(',start);
assert.ok(start>0&&end>start,'Source selector is defined before its controller');
const compiled=source.slice(start,end);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sales=[
  {routeKey:'coupang',merchantName:'쿠팡',selected:true},
  {routeKey:'11st',merchantName:'11번가',effectiveEnabled:true},
  {routeKey:'amazon-us',merchantName:'Amazon',selected:true},
  {routeKey:'trip',merchantName:'Trip.com'}
];
function model(search='',section='sourcing'){
  const calls=[],events=new Map(),urlChanges=[];
  const doc={querySelectorAll(query){return (events.get(query)||[]).map(item=>({
    getAttribute(name){return item.value},
    addEventListener(event,callback){if(event==='click')item.click=callback}
  }))}};
  const loc={search,href:'https://ekodi.kr/ekodimall/admin/'+section+search};
  const history={state:null,replaceState(...args){urlChanges.push(args[2])}};
  const api=new Function('location','section','ae','history','adminBase','document','affiliateSourcingPanel',
    compiled+'\nreturn {header:mallSourcingHeader,bind:bindMallSourcingTabs,state:()=>({view:mallSourcingView,detail:mallSourcingDetail,channel:mallSourcingCurrent})};'
  );
  return {...api(loc,section,escapeHtml,history,'/ekodimall/admin',doc,value=>calls.push(value)),
    add(kind,value){const attr={'view':'data-mall-source-view','channel':'data-mall-source-channel','detail':'data-mall-source-detail'}[kind];const key='['+attr+']';const item={value,click:null};events.set(key,[item]);return item},
    calls,urlChanges
  };
}

test('primary menu appears above provider row and Amazon actions are third tier',()=>{
  const ui=model('?channel=amazon');
  const html=ui.header(sales,'amazon');
  assert.equal((html.match(/data-mall-source-view=/g)||[]).length,7);
  assert.equal((html.match(/data-mall-source-channel=/g)||[]).length,5);
  assert.equal((html.match(/data-mall-source-detail=/g)||[]).length,6);
  assert.ok(html.indexOf('data-mall-source-view=')<html.indexOf('data-mall-source-channel='));
  assert.ok(html.indexOf('data-mall-source-channel=')<html.indexOf('data-mall-source-detail='));
  assert.match(html,/연동·인증/);
  assert.match(html,/비용정책/);
  assert.match(html,/Seller Central · SP-API/);
  assert.match(html,/aria-pressed="true"/);
});

test('overview shows first-level buttons only and usage removes third level',()=>{
  const summary=model('?view=overview&channel=amazon');
  const root=summary.header(sales,'amazon');
  assert.match(root,/data-mall-source-view/);
  assert.doesNotMatch(root,/data-mall-source-channel/);
  assert.doesNotMatch(root,/data-mall-source-detail/);
  const usage=model('?view=usage&channel=amazon');
  const form=usage.header(sales,'amazon');
  assert.match(form,/data-mall-source-channel/);
  assert.doesNotMatch(form,/data-mall-source-detail/);
});

test('changing function, channel, and operation updates canonical URL state without a reload',()=>{
  const ui=model('?view=channels&channel=amazon','amazon');
  const cost=ui.add('view','cost');
  const provider=ui.add('channel','route:coupang');
  const action=ui.add('detail','usage');
  ui.bind();
  cost.click();
  assert.equal(ui.state().detail,'cost');
  assert.match(ui.urlChanges[0],/^\/ekodimall\/admin\/sourcing\?view=cost&channel=amazon&detail=cost$/);
  provider.click();
  assert.equal(ui.state().channel,'route:coupang');
  assert.equal(ui.state().detail,'status');
  action.click();
  assert.equal(ui.state().detail,'usage');
  assert.equal(ui.calls.length,3);
  assert.equal(ui.calls.at(-1),'route:coupang');
});

test('Amazon forms and readonly synchronization keep their server-side protections',()=>{
  assert.match(source,/amazonReady=await amazonAdmin\(\)/);
  assert.match(source,/renderRequestId!==mallSourcingRequestId/);
  assert.match(source,/if\(panel\?\.tagName==='DETAILS'\)panel\.open=true/);
  assert.match(source,/for\(const child of \[\.\.\.workbench\.children\]\)child\.hidden=/);
  assert.match(source,/\.amazon-workbench>\[hidden\]\{display:none!important\}/);
  assert.match(source,/visible\.has\(item\.routeKey\)\?fd\.has\('route:'\+item\.routeKey\):Boolean\(item\.selected\)/);
  assert.match(source,/\/ekodimall\/api\/amazon\/sync\/read-only/);
  assert.match(source,/유료 기능 스위치를 켜더라도 기능별 승인 레코드와 금액 한도가 없으면/);
});

test('responsive menu does not invent marketplace activity or disable auth checks',()=>{
  assert.match(source,/\.mall-sourcing-primary\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(source,/@media\(max-width:650px\)/);
  assert.match(source,/workspaceAffiliateApi\('\/workspace\/sources'\)/);
  assert.match(source,/if\(!\(await accessToken\(\)\)\)return loginPanel/);
  assert.doesNotMatch(source,/Amazon\s+연결됨\s+128\s+상품/);
});
