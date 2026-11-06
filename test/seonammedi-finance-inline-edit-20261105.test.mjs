import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [server,app,html,css]=await Promise.all([
  read('seonammedi-admin-control.js'),
  read('sites/seonammedi/public/app.js'),
  read('sites/seonammedi/public/index.html'),
  read('sites/seonammedi/public/app.css')
]);

test('public finance disclosure accepts exactly period and three aggregate amounts',()=>{
  const start=server.indexOf("const FINANCE_DISCLOSURE_KEY='financeDisclosure';");
  const end=server.indexOf('const parseJsonObject=',start);
  assert.ok(start>0&&end>start,'validated finance disclosure parser exists');
  const parse=new Function(server.slice(start,end)+';return approvedFinanceDisclosure;')();
  const value={startDate:'2026-10-29',endDate:'2026-11-03',income:8900333,expense:10672100,balance:14051738};
  assert.deepEqual(parse(value),value);
  assert.equal(parse({...value,endDate:'2026-10-28'}),null);
  assert.equal(parse({...value,startDate:'2026-02-30'}),null);
  assert.equal(parse({...value,income:-1}),null);
  assert.equal(parse({...value,expense:1.5}),null);
  assert.equal(parse({...value,balance:'14051738'}),null);
  assert.equal(parse({...value,bankAccount:'private',supporterName:'private'}).bankAccount,undefined);
});

test('public finance editing uses site finance capability, audit and aggregate-only projection',()=>{
  assert.match(server,/async function putFinanceDisclosure\(request,env,auth\)\{\s*if\(!can\(auth,FINANCE_CAP\)\)return json\(\{ok:false,error:'finance_forbidden'\},403\)/);
  assert.match(server,/audit\(env,auth,'update','finance_disclosure'/);
  assert.match(server,/if\(row\.section_key===FINANCE_DISCLOSURE_KEY\)/);
  assert.match(server,/if\(approved\)page\.financeDisclosure=approved/);
  assert.match(server,/finance:\{raised:null,spent:null,balance:null,entries:\[\]\}/);
  assert.match(server,/PREFIX\+'\/admin\/finance-disclosure'&&request\.method==='PUT'/);
  assert.match(app,/if\(admin\.has\('finance'\)\)bindFinanceDisclosureEditor\(\)/);
  assert.match(app,/publicAdminJson\('\/api\/seonammedi\/admin\/finance-disclosure',\{method:'PUT'/);
  assert.match(app,/if\(pageBody\.page\?\.financeDisclosure\)renderFinanceDisclosure/);
  assert.match(css,/\.committee-finance-editor\[hidden\]\{display:none!important\}/);
});

test('activity heading is normalized without deleting the committee activity records',()=>{
  assert.match(html,/<h3 id="committeeNewsTitle">비상대책위 활동이력<\/h3>/);
  assert.doesNotMatch(html,/비상대책위 활동소식/);
  assert.match(html,/id="committeeActivityList"/);
});
