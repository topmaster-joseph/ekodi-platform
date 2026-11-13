import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const manifest=JSON.parse(read('deploy/manifests/shared-site.worker.json'));
const site=read('site-worker.js');
const workflow=read('.github/workflows/deploy-site-core.yml');
const keys=['ekodibiz','ekodichurch','ekodimission','cgma','seonammedi'];

test('all five public accounting notice URLs are release-blocking canaries',()=>{
  for(const key of keys){
    const url='https://ekodi.kr/'+key+'/accounting';
    const matches=manifest.worker.requests.filter(item=>item.url===url);
    assert.equal(matches.length,1,url);
    const entry=matches[0];
    assert.deepEqual(entry.statuses,[200]);
    assert.equal(entry.redirect,'manual');
    assert.ok(entry.expect.includes('회계공지'));
    assert.ok(entry.expect.includes('public-accounting-notice.js'));
    assert.ok(entry.headerExpect.includes('x-ekodi-route: public-accounting-notice'));
  }
  assert.match(site,/isPublicAccountingNoticePath\(url\.pathname\)/);
  assert.match(workflow,/deploy\/manifests\/shared-site\.worker\.json/);
});


test('public accounting pages outrank independent tenant and Church wildcard gateways',()=>{
  const config=read('wrangler.site.toml');
  const routes=[...config.matchAll(/^pattern = "([^\"]+)"$/gm)].map(match=>match[1]);
  for(const key of keys){
    const path=`ekodi.kr/${key}/accounting`;
    assert.equal(routes.filter(route=>route===path).length,1,`explicit Shared Site route required: ${path}`);
  }
  assert.match(config,/pattern = "ekodi\.kr\/ekodichurch\/admin\*"/);
  assert.match(config,/pattern = "ekodi\.kr\/ekodichurch\/board\*"/);
});

test('entry gateway serves five exact accounting notices before tenant SPACE fallback',async()=>{
  const {default:router}=await import('../platform-router-entry-worker.js');
  const paths=['ekodibiz','ekodichurch','ekodimission','cgma','seonammedi'];
  const entry=read('platform-router-entry-worker.js');
  const exact=entry.indexOf('isPublicAccountingNoticePath(url.pathname)');
  const churchSpace=entry.indexOf('isEkodiMissionSpacePath(url.pathname)');
  const tenantFallback=entry.indexOf('isPublicWorkspacePath(url.pathname)&&!isEkodiBizOwnedPath(url.pathname)');
  const seonam=entry.indexOf('isSeonamMediPath(url.pathname)');
  assert.ok(exact>0&&exact<churchSpace&&exact<tenantFallback&&exact<seonam);
  for(const site of paths){
    const url='https://ekodi.kr/'+site+'/accounting';
    const response=await router.fetch(new Request(url),{},{});
    assert.equal(response.status,200,url);
    assert.equal(response.headers.get('x-ekodi-route'),'public-accounting-notice',url);
    const html=await response.text();
    for(const marker of ['회계공지','연도 선택','연간 총괄','월별 소계','public-accounting-notice.js'])assert.ok(html.includes(marker),url+' missing '+marker);
  }
});

test('Finance release remains separately guarded; a public notice does not authorize payments',()=>{
  const finance=read('.github/workflows/deploy-finance.yml');
  assert.match(finance,/^\s*promote_production:\s*$/m);
  assert.match(finance,/needs: \[validate, staging\]/);
  assert.match(finance,/EKODI AI Orchestration Gate/);
  assert.match(finance,/guarded-worker-release/);
});
