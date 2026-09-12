import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('company Mall and Trade use independent channel tenants',async()=>{
  const [mall,growth,trade,auth,social,d1,pg]=await Promise.all([
    read('mall-promotion-automation.js'),read('marketing-growth-worker.js'),
    read('workspace-trade-portal.js'),read('auth-site/auth.js'),read('social-admin.js'),
    read('migrations/0079_channel_tenant_split.sql'),read('supabase/migrations/20260912080000_channel_tenant_split.sql')
  ]);
  assert.match(mall,/const SUBJECT_KEY = 'ekodimall'/);
  assert.match(growth,/subject\.key !== 'ekodimall'/);
  assert.match(trade,/WORKSPACE='ekoditrade'/);
  assert.match(auth,/tenant:'ekoditrade'/);
  for(const key of ['ekodi-biz','ekodimall','ekoditrade']) assert.ok(social.includes(key));
  assert.match(d1,/'ekodimall','autonomous',3/);
  assert.match(d1,/'ekodi-biz','review',1/);
  assert.match(d1,/'ekoditrade','review',1/);
  assert.match(pg,/slug='ekoditrade'/);
  assert.match(pg,/slug='ekodimall'/);
});

test('Mall YouTube is pinned to the verified operating account',async()=>{
  const ui=await read('workspace-admin-page.js');
  const growth=await read('marketing-growth-worker.js');
  assert.match(ui,/'ekodimall:mall:youtube':'topmaster\.joseph@gmail\.com'/);
  assert.match(growth,/key==='ekodimall'\)return 'topmaster\.joseph@gmail\.com'/);
});