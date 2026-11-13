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

test('Finance release remains separately guarded; a public notice does not authorize payments',()=>{
  const finance=read('.github/workflows/deploy-finance.yml');
  assert.match(finance,/^\s*promote_production:\s*$/m);
  assert.match(finance,/needs: \[validate, staging\]/);
  assert.match(finance,/EKODI AI Orchestration Gate/);
  assert.match(finance,/guarded-worker-release/);
});
