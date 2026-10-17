import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {localRegionBySlug} from '../local-region-registry.js';
import {localRegionPublicPage} from '../local-region-page.js';

test('Cheonggye public discovery offers source-first unified retrieval without false external article claims',async()=>{
  const html=await localRegionPublicPage(localRegionBySlug('cheonggye')).text();
  assert.match(html,/청계의 모든 것을<br>모두에게 잇다/);
  assert.match(html,/data-local-region-discovery-root/);
  assert.match(html,/data-discovery-query/);
  assert.match(html,/data-discovery-results/);
  assert.match(html,/role="status" aria-live="polite"/);
  for(const id of ['directory','commerce','events','jobs','sharing','broadcast','proposals']){
    assert.ok(html.includes('data-discovery-filter="'+id+'"'),id);
  }
  assert.match(html,/https:\/\/www\.muan\.go\.kr\//);
  assert.match(html,/https:\/\/www\.mokpo\.ac\.kr\//);
  assert.match(html,/https:\/\/www\.data\.go\.kr\//);
  assert.match(html,/공식 정보원/);
  assert.match(html,/rel="noopener noreferrer"/);
  assert.match(html,/local-region-module-public\.js/);
  assert.match(html,/href="\/cgma"/);
  assert.doesNotMatch(html,/회원명부|회비 납부 현황/);
});

test('discovery reads existing public ledger without writing to private data or scraping sites',async()=>{
  const source=await fs.readFile(new URL('../local-region-module-public.js',import.meta.url),'utf8');
  assert.match(source,/function discoveryMain\(\)/);
  assert.match(source,/Promise\.allSettled/);
  assert.match(source,/credentials:'omit'/);
  assert.match(source,/data\.items/);
  assert.match(source,/seen\.has\(key\)/);
  assert.match(source,/data-discovery-filter/);
  assert.match(source,/textContent=String\(value\)/);
  assert.match(source,/noopener noreferrer/);
  assert.match(source,/https\?:/);
  assert.doesNotMatch(source,/innerHTML\s*=/);
  assert.doesNotMatch(source,/method:\s*['"](?:POST|PUT|DELETE|PATCH)/);
});

test('discovery keeps existing module public client and routing contract',async()=>{
  const source=await fs.readFile(new URL('../local-region-module-public.js',import.meta.url),'utf8');
  const router=await fs.readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(source,/function clientMain\(\)/);
  assert.match(source,/function discoveryMain\(\)/);
  assert.match(source,/clientMain\.toString\(\)/);
  assert.match(source,/discoveryMain\.toString\(\)/);
  assert.match(router,/localRegionModulePublicScript/);
  assert.match(router,/\/cheonggye\/local-region-module-public\.js/);
});
