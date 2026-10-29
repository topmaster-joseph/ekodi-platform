import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
const from=source.indexOf('  const mallSourcingIsAmazon=');
const to=source.indexOf('  async function affiliateSourcingPanel(',from);
assert.ok(from>0&&to>from,'Mall provider selector is available');
const extracted=source.slice(from,to);
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function selector(){
  return new Function('location','section','ae',extracted+'\nreturn {key:mallSourcingTabKey,html:mallSourcingHeader};')(
    {search:''},'sourcing',escapeHtml
  );
}

test('sales channels render as dynamic top-right provider buttons including Amazon',()=>{
  const {key,html}=selector();
  const sources=[
    {routeKey:'coupang',merchantName:'쿠팡',effectiveEnabled:true},
    {routeKey:'amazon-us',merchantName:'Amazon',selected:false},
    {routeKey:'11st',merchantName:'11번가',selected:true}
  ];
  assert.equal(key(sources[1]),'amazon');
  assert.equal(key(sources[0]),'route:coupang');
  const markup=html(sources,'route:coupang');
  assert.equal((markup.match(/data-mall-source-channel=/g)||[]).length,4,'overview + three channels, no Amazon duplicate');
  assert.match(markup,/mall-sourcing-tabs/);
  assert.match(markup,/aria-label="판매채널 선택"/);
  assert.match(markup,/쿠팡/);
  assert.match(markup,/11번가/);
  assert.match(markup,/Amazon/);
  assert.match(markup,/data-mall-source-channel="route:coupang" aria-pressed="true"/);
});

test('Amazon is included even without a common network route; duplicate marketplaces share a button',()=>{
  const {html}=selector();
  assert.match(html([{routeKey:'coupang',merchantName:'쿠팡'}],'amazon'),/data-mall-source-channel="amazon" aria-pressed="true"/);
  const markup=html([{routeKey:'amazon-us',merchantName:'Amazon US'},{routeKey:'amazon-jp',merchantName:'Amazon JP'}],'amazon');
  assert.equal((markup.match(/data-mall-source-channel="amazon"/g)||[]).length,1);
});

test('provider names are escaped and single-route saves preserve other routes',()=>{
  const {html}=selector();
  const markup=html([{routeKey:'x',merchantName:'<img src=x onerror=alert(1)>'}],'route:x');
  assert.doesNotMatch(markup,/<img src=x/);
  assert.match(markup,/&lt;img/);
  assert.match(source,/const chosen=sources\.filter\(item=>mallSourcingTabKey\(item\)===selected\)/);
  assert.match(source,/visible\.has\(item\.routeKey\)\?fd\.has\('route:'\+item\.routeKey\):Boolean\(item\.selected\)/);
  assert.match(source,/await workspaceAffiliateApi\('\/workspace\/sources',\{method:'PUT'/);
  assert.match(source,/const canonicalPath=section==='amazon'\?adminBase\+'\/sourcing'/);
  assert.match(source,/MALL_SOURCING_TABS_CSS/);
});

test('Amazon workbench re-renders through unified sourcing instead of standalone navigation',()=>{
  assert.match(source,/if\(section==='amazon'\)return affiliateSourcingPanel\('amazon'\)/);
  assert.match(source,/amazonReady=await amazonAdmin\(\)/);
  assert.match(source,/affiliateSourcingPanel\('amazon'\);/);
  assert.doesNotMatch(source,/a\.classList\.add\('admin-nav-nested'\)/);
  assert.match(source,/return false;\s*}\s*}\s*async function/);
});
