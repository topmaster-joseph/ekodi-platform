import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL('../'+name,import.meta.url),'utf8');
const [frontend,backend] = await Promise.all([read('workspace-admin-page.js'),read('affiliate-control.js')]);
const begin=frontend.indexOf('  const mallSourcingSelectionPatch=');
const end=frontend.indexOf('\n\n  // Every sales/affiliate route',begin);
assert.ok(begin>0&&end>begin,'merchant-only selection helper is available');
const selectionPatch=new Function(frontend.slice(begin,end)+'\nreturn mallSourcingSelectionPatch;')();

const rows=[
 {routeKey:'11st',selected:false,merchantName:'11번가'},
 {routeKey:'coupang',selected:true,merchantName:'쿠팡'},
 {routeKey:'amazon-us',selected:true,merchantName:'Amazon US'},
 {routeKey:'amazon-jp',selected:false,merchantName:'Amazon JP'},
 {routeKey:'trip',selected:true,merchantName:'Trip.com'}
];
const form=(...checked)=>({has:name=>checked.includes(name)});

test('single merchant save affects only the selected merchant; no stale snapshot writes',()=>{
 const updated=selectionPatch(rows.filter(r=>r.routeKey==='coupang'),form());
 assert.deepEqual(updated,[{routeKey:'coupang',enabled:false}]);
 assert.equal(updated.some(x=>x.routeKey==='trip'),false);
 assert.equal(updated.some(x=>x.routeKey==='11st'),false);
 // A different admin could have updated Trip.com after the initial GET:
 // omitted routes must not be persisted or audited by this API call.
 assert.match(frontend,/const selections=mallSourcingSelectionPatch\(chosen,formData,freshRoutes,bootstrap\)/);
 assert.doesNotMatch(frontend,/const selections=sources\.map\(item=>/);
});

test('selected Amazon marketplace tab updates its own grouped source rows only',()=>{
 const amazon=rows.filter(r=>/^amazon-/.test(r.routeKey));
 const updated=selectionPatch(amazon,form('route:amazon-jp'));
 assert.deepEqual(updated,[
  {routeKey:'amazon-us',enabled:false},
  {routeKey:'amazon-jp',enabled:true}
 ]);
 assert.equal(updated.some(x=>x.routeKey==='coupang'),false);
});

test('unchecked toggles are explicit false; duplicate or empty route names do not expand write scope',()=>{
 assert.deepEqual(selectionPatch([{routeKey:''}],form()),[]);
 assert.deepEqual(selectionPatch(rows.filter(x=>x.routeKey==='trip'),form('route:trip')),[{routeKey:'trip',enabled:true}]);
 assert.match(frontend,/if\(!selections\.length\)throw new Error\('저장할 판매처가 없습니다\.'\)/);
});

test('server accepts partial selected rows, still enforces roles and audits only submitted keys',()=>{
 assert.match(backend,/if \(!context \|\| !WORKSPACE_MANAGE_ROLES\.has\(context\.role\)\)/);
 assert.match(backend,/const selections = Array\.isArray\(body\?\.selections\) \? body\.selections\.slice\(0,100\) : \[\]/);
 assert.match(backend,/for \(const item of selections\) \{/);
 assert.match(backend,/INSERT INTO affiliate_workspace_sources\(/);
 assert.match(backend,/INSERT INTO affiliate_workspace_source_audit\(/);
 assert.match(backend,/if \(known\.size !== keys\.length\) return json\(\{ error:'unknown_affiliate_route' \}/);
});

test('first workspace write materializes inherited ready defaults without disabling unrelated routes',()=>{
 const initial=[
  {routeKey:'coupang',selected:true},
  {routeKey:'amazon-us',selected:false},
  {routeKey:'11st',selected:true}
 ];
 const full=selectionPatch([initial[0]],form(),initial,true);
 assert.deepEqual(full,[
  {routeKey:'coupang',enabled:false},
  {routeKey:'amazon-us',enabled:false},
  {routeKey:'11st',enabled:true}
 ]);
 const later=selectionPatch([initial[0]],form(),initial,false);
 assert.deepEqual(later,[{routeKey:'coupang',enabled:false}]);
 assert.match(frontend,/const latest=await workspaceAffiliateApi\('\/workspace\/sources'\)/);
 assert.match(frontend,/latest\.policy\?\.inheritedDefaults===true/);
 assert.match(frontend,/bootstrap&&freshRoutes\.length>100/);
 assert.match(backend,/const inheritedDefaults = Number\(configured\?\.count \|\| 0\) === 0/);
});
